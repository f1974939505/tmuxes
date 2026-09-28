"""Translate Claude hook payloads; never return hook decisions or context."""

HOOKS = ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
         "PostToolUseFailure", "PermissionRequest", "Notification", "Stop",
         "StopFailure", "SessionEnd", "SubagentStart", "SubagentStop")


class Claude:
    def __init__(self, emit):
        self.emit = emit
        self.root = None
        self.children = set()

    def handle(self, p):
        event = p.get("hook_event_name", "")
        sid = p.get("session_id")
        if event == "SessionStart" and not p.get("agent_id") and sid != self.root:
            self.root = sid
            self.children.clear()
            self.emit({"type": "tasks", "ids": [], "known": False})
            self.emit({"type": "unknown", "event": "SessionStart"})
        elif self.root is None and event == "UserPromptSubmit":
            self.root = sid
        # A hook inherited by a child must never finish/reset the root session.
        child = bool(p.get("agent_id")) and event not in ("SubagentStart", "SubagentStop")
        child = child or (self.root is not None and sid != self.root)
        def send(kind, **data):
            self.emit({"type": kind, "event": event, **data})
        tool = p.get("tool_name", "")
        request = str(p.get("tool_use_id") or "prompt")
        if event == "UserPromptSubmit" and not child:
            send("start")
        elif event == "SubagentStart":
            self.children.add(str(p.get("agent_id")))
            send("task.start", id="child:" + str(p.get("agent_id")))
        elif event == "SubagentStop":
            self.children.discard(str(p.get("agent_id")))
            send("task.end", id="child:" + str(p.get("agent_id")))
        elif event == "PreToolUse":
            if not child:
                send("activity")
            if tool in ("AskUserQuestion", "ExitPlanMode"):
                send("decision.open", id=request)
        elif event in ("PostToolUse", "PostToolUseFailure"):
            send("decision.close", id=request)
            send("decision.close", id="prompt")
            if not child:
                send("activity")
        elif event == "Notification":
            if p.get("notification_type") in ("permission_prompt", "elicitation_dialog"):
                send("decision.open", id=request)
        # PermissionRequest precedes other hooks/automatic review. Notification
        # and explicit question tools are the evidence that a human is needed.
        elif event == "Stop" and not child:
            tasks, crons = p.get("background_tasks"), p.get("session_crons")
            known = isinstance(tasks, list) and isinstance(crons, list)
            ids = ["child:" + x for x in self.children]
            if isinstance(tasks, list):
                ids += ["background:" + str(x.get("id", i)) for i, x in enumerate(tasks)]
            if isinstance(crons, list):
                ids += ["cron:" + str(x.get("id", i)) for i, x in enumerate(crons)]
            send("tasks", ids=ids, known=known)
            # A continued Stop hook is not evidence that its continuation/goal
            # has terminated. Prefer unknown over a premature finished alert.
            send("stop", known=known and not p.get("stop_hook_active", False))
        elif event == "StopFailure" and not child:
            send("error")
        elif event == "SessionEnd" and not child:
            send("closed")

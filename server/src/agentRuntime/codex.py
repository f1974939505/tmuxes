"""Read-only status inspection on the TUI's existing JSON-RPC connection.

Never answers server requests, resumes threads, or changes approval/config.
Only our namespaced snapshot responses are consumed; TUI traffic is forwarded.
"""
import uuid


class Codex:
    def __init__(self, emit, send, on_bind=None):
        self.emit, self.send = emit, send
        self.on_bind = on_bind
        self.root = None
        self.client_requests = {}
        self.queries = {}
        self.prefix = "tmuxes-" + uuid.uuid4().hex + "-"
        self.sequence = 0
        self.generation = 0
        self.batch = None
        self.children = set()
        self.completion_pending = False
        self.last_status = None

    def event(self, kind, **data):
        if kind in ("start", "stop"):
            data["preserveRequests"] = True
        self.emit({"type": kind, "event": "CodexProtocol", **data})

    def query(self, method, params, tag):
        self.sequence += 1
        key = self.prefix + str(self.sequence)
        self.queries[key] = (self.generation, tag)
        self.send({"id": key, "method": method, "params": params})

    def client(self, msg):
        method = msg.get("method", "")
        if method in ("thread/start", "thread/resume", "thread/fork"):
            self.client_requests[msg.get("id")] = method
        # Responses to approvals are forwarded untouched. The authoritative
        # serverRequest/resolved notification removes the pending request.

    def server(self, msg):
        key = msg.get("id")
        if key in self.queries and not msg.get("method"):
            generation, tag = self.queries.pop(key)
            if generation == self.generation:
                self.answer(tag, msg)
            return False
        if key in self.client_requests and not msg.get("method"):
            self.client_requests.pop(key)
            thread = msg.get("result", {}).get("thread", {})
            if thread.get("id"):
                self.root = thread["id"]
                if self.on_bind:
                    self.on_bind()
                self.generation += 1
                self.children.clear()
                self.batch = None
                self.completion_pending = False
                self.last_status = thread.get("status", {}).get("type")
                self.event("reset")
        p = msg.get("params") or {}
        method = msg.get("method", "")
        tid = p.get("threadId")
        root = self.root is not None and tid == self.root
        related = root or tid in self.children
        if method == "thread/started":
            thread = p.get("thread", {})
            if self.root and thread.get("parentThreadId") in ({self.root} | self.children):
                if self.batch is not None:
                    self.generation += 1
                    self.batch = None
                    self.completion_pending = False
                self.children.add(thread["id"])
                self.event("task.start", id="child:" + thread["id"])
        if not related:
            return True
        if method == "turn/started" and not root:
            if self.batch is not None:
                self.generation += 1
                self.batch = None
                self.completion_pending = False
            self.event("task.start", id="child:" + tid)
        if method == "turn/started" and root:
            self.generation += 1
            self.batch = None
            self.completion_pending = False
            self.event("start")
        elif method == "turn/completed" and root:
            status = p.get("turn", {}).get("status")
            if status == "failed":
                self.event("error")
            elif status == "interrupted":
                self.event("interrupted")
            elif status == "completed":
                self.completion_pending = True
                self.event("stop", known=False)
                self.snapshot()
        elif method == "error":
            if root:
                self.event("error", willRetry=p.get("willRetry", False))
        elif method == "thread/status/changed":
            status = p.get("status", {})
            if root:
                self.last_status = status.get("type")
                if self.last_status == "idle" and self.completion_pending and self.batch is None:
                    self.snapshot()
            if root and status.get("type") == "systemError":
                self.event("error")
            if root and status.get("type") == "notLoaded":
                self.event("unknown")
        elif method == "serverRequest/resolved":
            self.event("decision.close", id=str(p.get("requestId")))
        elif key is not None and method in (
                "item/commandExecution/requestApproval", "item/fileChange/requestApproval",
                "item/permissions/requestApproval", "item/tool/requestUserInput",
                "mcpServer/elicitation/request"):
            # These are requests actually delivered to the original TUI, not
            # PermissionRequest hooks that may be handled by automatic review.
            self.event("decision.open", id=str(key))
        elif method == "item/started":
            if root:
                self.event("activity")
            item = p.get("item", {})
            for child in item.get("receiverThreadIds", []):
                self.children.add(child)
                self.event("task.start", id="child:" + child)
        elif method == "thread/goal/updated" and root:
            status = (p.get("goal") or {}).get("status")
            if status == "active":
                self.event("task.start", id="goal")
            elif status in ("blocked", "usageLimited", "budgetLimited"):
                self.event("decision.open", id="goal")
            else:
                self.event("task.end", id="goal")
        return True

    def snapshot(self):
        self.batch = {"pending": 3, "ids": set(), "known": True, "idle": False,
                      "decision": False}
        self.query("thread/read", {"threadId": self.root}, "root")
        self.query("thread/goal/get", {"threadId": self.root}, "goal")
        self.query("thread/list", {"ancestorThreadId": self.root, "limit": 100}, "children")
        self.terminals(self.root)

    def terminals(self, tid, cursor=None):
        self.batch["pending"] += 1
        self.query("thread/backgroundTerminals/list",
                   {"threadId": tid, "limit": 100, **({"cursor": cursor} if cursor else {})},
                   "terminals:" + tid)

    def answer(self, tag, msg):
        b = self.batch
        if b is None:
            return
        b["pending"] -= 1
        result = msg.get("result")
        if not isinstance(result, dict) or "error" in msg:
            b["known"] = False
        elif tag == "root":
            status = result.get("thread", {}).get("status", {})
            b["idle"] = status.get("type") == "idle"
        elif tag == "goal":
            goal = result.get("goal")
            if goal and goal.get("status") == "active":
                b["ids"].add("goal")
            elif goal and goal.get("status") in ("blocked", "usageLimited", "budgetLimited"):
                b["decision"] = True
        elif tag == "children":
            if not isinstance(result.get("data"), list):
                b["known"] = False
            for child in result.get("data", []):
                tid = child["id"]
                self.children.add(tid)
                status = child.get("status", {}).get("type")
                if status == "active":
                    b["ids"].add("child:" + tid)
                elif status not in ("idle", "notLoaded"):
                    b["known"] = False
                # Only loaded descendants can have live terminal processes.
                if status != "notLoaded":
                    self.terminals(tid)
            if result.get("nextCursor"):
                b["pending"] += 1
                self.query("thread/list", {"ancestorThreadId": self.root, "limit": 100,
                                           "cursor": result["nextCursor"]}, "children")
        elif tag.startswith("terminals:"):
            if not isinstance(result.get("data"), list):
                b["known"] = False
            for process in result.get("data", []):
                b["ids"].add(tag + ":" + str(process.get("processId")))
            if result.get("nextCursor"):
                self.terminals(tag[len("terminals:"):], result["nextCursor"])
        if b["pending"] == 0:
            self.event("tasks", ids=list(b["ids"]), known=b["known"])
            self.event("stop", known=b["known"] and b["idle"])
            if b["decision"]:
                self.event("decision.open", id="goal")
            self.completion_pending = b["known"] and not b["idle"]
            self.batch = None

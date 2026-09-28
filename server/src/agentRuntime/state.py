"""Agent-independent attention reducer. No terminal-text or inactivity guesses."""
import time


class State:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.running = False
        self.tasks = set()
        self.requests = set()
        self.complete_at = None
        self.error = False
        self.known = False
        self.event = "launch"
        self.revision = 0

    def apply(self, event):
        kind = event.get("type")
        self.event = event.get("event", kind or "unknown")
        self.revision += 1
        if kind == "start":
            self.running, self.error = True, False
            self.complete_at = None
            if not event.get("preserveRequests"):
                self.requests.clear()
            self.known = True
        elif kind == "activity":
            self.running = True
            self.complete_at = None
        elif kind == "task.start":
            self.tasks.add(str(event["id"]))
            self.complete_at = None
        elif kind == "task.end":
            self.tasks.discard(str(event["id"]))
            # Child completion is NOT a final response from the root agent.
        elif kind == "tasks":
            self.tasks = set(map(str, event.get("ids", [])))
            self.known = event.get("known") is True
            if self.tasks or not self.known:
                self.complete_at = None
        elif kind == "decision.open":
            self.requests.add(str(event["id"]))
            self.complete_at = None
        elif kind == "decision.close":
            self.requests.discard(str(event["id"]))
        elif kind == "stop":
            self.running = False
            if not event.get("preserveRequests"):
                self.requests.clear()
            self.known = event.get("known") is True
            self.complete_at = (self.clock() + 1.5
                                if self.known and not self.tasks and not self.requests and not self.error else None)
        elif kind == "error":
            if not event.get("willRetry", False):
                self.error, self.running = True, False
                self.complete_at = None
                self.requests.clear()
        elif kind in ("unknown", "closed", "interrupted"):
            self.running, self.known = False, False
            self.complete_at = None
            self.requests.clear()

    def snapshot(self):
        if self.error:
            return "idle", "error"
        if self.requests:
            return "waiting", "decision"
        if self.running:
            return "running", ""
        if self.tasks:
            return "background", ""
        if self.complete_at is not None:
            if self.clock() >= self.complete_at:
                return "idle", "done"
            return "settling", ""
        return "unknown", ""

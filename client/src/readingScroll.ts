type ScrollPosition = { scrollTop: number; scrollHeight: number; clientHeight: number };

/** User intent owns follow mode; rendering and delayed responses cannot restore it. */
export class ReadingScroll {
  following = true;
  revision = 0;
  private top = 0;
  private direction = 0;

  input(direction: number, element: ScrollPosition) {
    this.revision++;
    this.top = element.scrollTop;
    this.direction = Math.sign(direction);
    if (direction < 0) this.following = false;
  }

  latest(element: ScrollPosition) {
    this.input(0, element);
    this.following = true;
  }

  observe(element: ScrollPosition) {
    const delta = element.scrollTop - this.top;
    if (Math.abs(delta) < 0.5) return;
    this.revision++;
    this.top = element.scrollTop;
    const atBottom = element.scrollHeight - element.clientHeight - element.scrollTop <= 2;
    // Evicting old messages or growing the dock can clamp scrollTop upwards.
    // Upward wheel/key/touch intent has already released follow synchronously.
    if (delta < 0 && !atBottom) this.following = false;
    else if (delta > 0 && this.direction >= 0 && atBottom)
      this.following = true;
  }

  follow(element: ScrollPosition, revision = this.revision) {
    if (!this.following || revision !== this.revision) return;
    this.position(element, element.scrollHeight, revision);
  }

  position(element: ScrollPosition, top: number, revision: number) {
    if (revision !== this.revision) return;
    element.scrollTop = top;
    // Record programmatic movement before its deferred scroll event arrives.
    this.top = element.scrollTop;
  }
}

import { describe, expect, it } from 'vitest';
import { ReadingScroll } from '../src/readingScroll';

function viewport() {
  let top = 900;
  return {
    scrollHeight: 1000, clientHeight: 100,
    get scrollTop() { return top; },
    set scrollTop(value: number) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
  };
}

describe('reading scroll intent during asynchronous layout', () => {
  it('releases on a tiny upward wheel before native scrolling or content resize', () => {
    const follow = new ReadingScroll(), element = viewport();
    follow.follow(element);
    follow.input(-1, element);
    // ResizeObserver may run before the browser applies the wheel movement.
    element.scrollHeight += 200;
    follow.follow(element);
    expect(element.scrollTop).toBe(900);
    element.scrollTop -= 1;
    follow.observe(element);
    follow.follow(element);
    expect(element.scrollTop).toBe(899);
    expect(follow.following).toBe(false);
  });

  it('does not let a pending response or history anchor override a later gesture', () => {
    const follow = new ReadingScroll(), element = viewport();
    follow.follow(element);
    const response = follow.revision;
    follow.input(-1, element);
    element.scrollTop -= 10;
    follow.observe(element);
    follow.follow(element, response);
    follow.position(element, 500, response);
    expect(element.scrollTop).toBe(890);
  });

  it('resumes only after downward input actually reaches the bottom', () => {
    const follow = new ReadingScroll(), element = viewport();
    follow.follow(element);
    follow.input(-10, element);
    element.scrollTop = 850;
    follow.observe(element);
    follow.input(1, element);
    element.scrollTop = 880;
    follow.observe(element);
    expect(follow.following).toBe(false);
    element.scrollTop = 899;
    follow.observe(element);
    expect(follow.following).toBe(true);
    element.scrollHeight += 200;
    follow.follow(element);
    expect(element.scrollTop).toBe(1100);
  });

  it('does not mistake a deferred programmatic scroll event for downward input', () => {
    const follow = new ReadingScroll(), element = viewport();
    follow.follow(element);
    follow.input(-1, element);
    follow.observe(element);
    expect(follow.following).toBe(false);
    follow.input(1, element);
    follow.observe(element);
    expect(follow.following).toBe(false);
    follow.latest(element);
    follow.follow(element);
    expect(follow.following).toBe(true);
  });

  it('allows scrollbar movement up and back down without a wheel event', () => {
    const follow = new ReadingScroll(), element = viewport();
    follow.follow(element);
    follow.input(0, element);
    element.scrollTop = 700;
    follow.observe(element);
    expect(follow.following).toBe(false);
    element.scrollTop = 900;
    follow.observe(element);
    expect(follow.following).toBe(true);
  });

  it('keeps following when layout shrink clamps the viewport at the new bottom', () => {
    const follow = new ReadingScroll(), element = viewport();
    follow.follow(element);
    element.scrollHeight = 800;
    element.scrollTop = element.scrollTop;
    follow.observe(element);
    expect(follow.following).toBe(true);
    element.scrollHeight += 300;
    follow.follow(element);
    expect(element.scrollTop).toBe(1000);
  });

  it('keeps a prepended history anchor stable until another user gesture', () => {
    const follow = new ReadingScroll(), element = viewport();
    follow.input(-1, element);
    element.scrollTop = 500;
    follow.observe(element);
    const layout = follow.revision;
    element.scrollHeight += 300;
    follow.position(element, 800, layout);
    follow.observe(element);
    expect(follow.following).toBe(false);
    expect(follow.revision).toBe(layout);
    follow.input(-1, element);
    follow.position(element, 900, layout);
    expect(element.scrollTop).toBe(800);
  });
});

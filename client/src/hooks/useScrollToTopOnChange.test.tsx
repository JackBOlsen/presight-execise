import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrollToTopOnChange } from './useScrollToTopOnChange';

describe('useScrollToTopOnChange', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('does not scroll on the first render', () => {
    // Opening a shared link is not a change, and the browser may be restoring a
    // position on reload.
    renderHook(() => useScrollToTopOnChange('sort=age'));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to the top when the key changes', () => {
    const { rerender } = renderHook(({ key }) => useScrollToTopOnChange(key), {
      initialProps: { key: 'sort=age' },
    });
    rerender({ key: 'sort=last_name' });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('stays put when the key is unchanged', () => {
    // Loading another page re-renders without changing the view state, and
    // yanking the reader to the top mid-scroll would be the worse bug.
    const { rerender } = renderHook(({ key }) => useScrollToTopOnChange(key), {
      initialProps: { key: 'q=ada' },
    });
    rerender({ key: 'q=ada' });
    rerender({ key: 'q=ada' });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls again on each subsequent change', () => {
    const { rerender } = renderHook(({ key }) => useScrollToTopOnChange(key), {
      initialProps: { key: '' },
    });
    rerender({ key: 'hobby=Chess' });
    rerender({ key: 'hobby=Chess&hobby=Yoga' });
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
  });
});

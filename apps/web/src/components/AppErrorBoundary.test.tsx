import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function BrokenContent(): never {
  throw new Error('测试渲染错误');
}

describe('AppErrorBoundary', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('shows a recoverable error state instead of a blank page', () => {
    render(<AppErrorBoundary><BrokenContent /></AppErrorBoundary>);
    expect(screen.getByRole('heading', { name: '页面暂时无法显示' })).toBeInTheDocument();
    expect(screen.getByText('测试渲染错误')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeInTheDocument();
  });
});

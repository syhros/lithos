import React from 'react';
import { clsx } from 'clsx';

interface SkeletonLoaderProps {
  isLoading: boolean;
  children: React.ReactNode;
  height?: string;
  width?: string;
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  isLoading,
  children,
  height = 'h-20',
  width = 'w-full',
  className = '',
}) => {
  if (!isLoading) {
    return <>{children}</>;
  }

  return (
    <div className={clsx('skeleton-loader', width, height, className)} />
  );
};

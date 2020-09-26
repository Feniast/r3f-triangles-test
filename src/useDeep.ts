import { useRef, useCallback, useEffect } from 'react';
import { equal as isEqual } from '@wry/equality';

export const useDeepCompareMemoize = <T>(value: T) => {
  const ref = useRef<T>();

  if (!isEqual(value, ref.current)) {
    ref.current = value;
  }

  return ref.current;
};

export const useDeepCompareCallback = <T extends ReadonlyArray<any>>(
  callback: (...args: any[]) => any,
  deps: T
) => {
  return useCallback(callback, useDeepCompareMemoize(deps));
};

export const useDeepCompareEffect = <T extends ReadonlyArray<any>>(
  callback: (...args: any[]) => any,
  deps: T
) => {
  return useEffect(callback, useDeepCompareMemoize(deps));
};

export const useDeepMemo = <T>(memoFn: () => T, key: any) => {
  const ref = useRef<{ key: any; value: T }>();
  if (!ref.current || !isEqual(key, ref.current.key)) {
    ref.current = { key, value: memoFn() };
  }

  return ref.current.value;
};
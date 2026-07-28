import * as fc from 'fast-check';

export const stringOf = (
  chars: fc.Arbitrary<string>,
  options: { minLength: number; maxLength: number },
): fc.Arbitrary<string> =>
  fc.array(chars, { minLength: options.minLength, maxLength: options.maxLength }).map((arr) =>
    arr.join(''),
  );

export const hexString = (
  options: { minLength: number; maxLength: number } = { minLength: 1, maxLength: Infinity },
): fc.Arbitrary<string> =>
  fc
    .array(
      fc.constantFrom(
        ...'0123456789abcdef'.split(''),
      ),
      { minLength: options.minLength, maxLength: options.maxLength },
    )
    .map((arr) => arr.join(''));

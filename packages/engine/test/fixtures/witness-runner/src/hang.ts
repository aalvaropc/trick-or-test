/** Never settles. Used to check that a hanging witness is reported as a timeout. */
export function hang(): Promise<number> {
  return new Promise<number>(() => {});
}

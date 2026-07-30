export {};

declare global {
  interface ObjectConstructor {
    freeze<const T>(value: T): Readonly<T>;
  }
}

declare module 'occt-import-js' {
  type OcctImportFactory = (options?: Record<string, unknown>) => Promise<unknown>;
  const factory: OcctImportFactory;
  export default factory;
}

export const postgresNotImplemented = (methodName: string): never => {
  throw new Error(
    `[DATA_PROVIDER=postgres] Method '${methodName}' is not implemented for the core schema yet. ` +
      "Switch to DATA_PROVIDER=mock or implement PostgreSQL core adapters."
  );
};

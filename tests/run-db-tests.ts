process.env.RUN_DB_TESTS = "1";
void import("./db-tenant-isolation.test").catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

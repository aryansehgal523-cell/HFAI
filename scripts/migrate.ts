/* Applies the SQL migrations in ./drizzle to the database in DATABASE_URL. */
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../src/db";

migrate(db, { migrationsFolder: "./drizzle" })
  .then(() => {
    console.log("Database is up to date");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

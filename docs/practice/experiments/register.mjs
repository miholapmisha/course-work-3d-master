// Lets Node run the project's extensionless ESM imports ("./detection") the way Vite does.
import { register } from "node:module";

register("./resolve-ext.mjs", import.meta.url);

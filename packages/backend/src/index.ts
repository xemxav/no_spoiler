process.loadEnvFile();

import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3210);
const client = new TypeSafeClient();
const app = createApp(client);

app.listen(port, "0.0.0.0", () => {
  console.log(`backend listening on 0.0.0.0:${port}`);
});

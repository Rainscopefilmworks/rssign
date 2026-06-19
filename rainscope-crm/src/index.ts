import { loadConfig } from "./config.js";
import { createApp } from "./server.js";

const config = loadConfig();
const app = createApp({
  databasePath: config.databasePath
});

app.listen(config.port, config.host, () => {
  console.log(
    `Rainscope CRM listening at http://${config.host}:${config.port}`
  );
});

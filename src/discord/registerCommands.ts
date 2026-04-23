import { REST, Routes } from "discord.js";
import { commandBuilders } from "./commands.js";
import { readConfig } from "../config.js";

const run = async () => {
  const config = readConfig();
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

  if (config.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
      { body: commandBuilders },
    );
    console.log(`Registered ${commandBuilders.length} guild commands.`);
    return;
  }

  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
    body: commandBuilders,
  });
  console.log(`Registered ${commandBuilders.length} global commands.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

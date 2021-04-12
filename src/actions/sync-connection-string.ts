import { delay } from "../deps/async-utils.ts";
import { createCliAction } from "../deps/cli-utils.ts";
import { Type } from "../deps/typebox.ts";
import { loggerWithContext } from "../logger.ts";
import {
  fdbcliCaptureExec,
  updateConnectionStringConfigMap,
} from "../utils.ts";

const logger = loggerWithContext("main");
const FDB_CLUSTER_FILE = "FDB_CLUSTER_FILE";
const connectionStringResultRegex =
  /`\\xff\\xff\/connection_string' is `([^']+)'/;

export default createCliAction(
  Type.Object({
    configMapKey: Type.String(),
    configMapName: Type.String(),
    updateIntervalMs: Type.Number(),
  }),
  async (
    {
      configMapKey,
      configMapName,
      updateIntervalMs,
    },
  ) => {
    const clusterFile = Deno.env.get(FDB_CLUSTER_FILE);

    if (!clusterFile) {
      throw new Error(`${FDB_CLUSTER_FILE} env variable is not set`);
    }

    let lastConnectionString = await Deno.readTextFile(clusterFile);

    while (true) {
      try {
        logger.info("Getting current connection string");
        const connectionStringResult = await fdbcliCaptureExec(
          `get \\xFF\\xFF/connection_string`,
        );

        const connectionStringMatch = connectionStringResult.match(
          connectionStringResultRegex,
        );

        if (!connectionStringMatch) {
          throw new Error(
            `Connection string result doesn't match regex: ${connectionStringResult}`,
          );
        }

        const connectionString = connectionStringMatch[1];

        if (connectionString === lastConnectionString) {
          logger.info(`Connection string hasn't changed`, connectionString);
        } else {
          logger.info(
            `Going to update ConfigMap '${configMapName}' with data key '${configMapKey}' and value '${connectionString}'`,
          );

          await updateConnectionStringConfigMap({
            configMapKey,
            configMapName,
            connectionString,
          });

          logger.info(`ConfigMap '${configMapName}' updated successfully!`);

          lastConnectionString = connectionString;
        }
      } catch (e) {
        logger.error(e.toString());
      }

      await delay(updateIntervalMs);
    }
  },
);

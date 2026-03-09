/**
 * Checkpointer singleton compartilhado entre graph e serviços (ex: conversation-summary).
 */

import { RedisSaver } from "./services/redis-saver.js";

export const checkpointer = new RedisSaver();

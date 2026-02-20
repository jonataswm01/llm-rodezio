import type { FastifyBaseLogger, FastifyInstance, RawRequestDefaultExpression, RawReplyDefaultExpression, RawServerDefault } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"

export type FastifyTypedInstance = FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    FastifyBaseLogger,
    ZodTypeProvider
>
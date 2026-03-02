import { initializeLangSmith } from './config/langsmith.js'

initializeLangSmith()

import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { fastifySwagger } from '@fastify/swagger'
import { fastifySwaggerUi } from '@fastify/swagger-ui'
import { fastifyCors } from '@fastify/cors'
import { routes } from './routes'


const app = fastify().withTypeProvider<ZodTypeProvider>()

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
})

app.register(fastifySwagger, {
    openapi: {
        info: {
            title: 'LLM Rodezio',
            description: 'API for the LLM Rodezio',
            version: '1.0.0',
        },
    },
    transform: jsonSchemaTransform,
})

app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
})

app.register(routes)

app.listen({ port: 3333, host: '0.0.0.0' }).then(() => {
  console.log('🚀 HTTP server running on http://localhost:3333')
  console.log('🔗 Swagger UI: http://localhost:3333/docs')
})

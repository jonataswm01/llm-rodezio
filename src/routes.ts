import z from "zod"
import type { FastifyTypedInstance } from "./types"
import { randomUUID } from "crypto"
import { runAgent } from "./agents/langgraph"

const userSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
})

type User = z.infer<typeof userSchema>

const users: User[] = []

export async function routes(app: FastifyTypedInstance) {
    app.get('/users', {
        schema: {
            tags: ['users'],
            description: 'List all users',
            response: {
                200: z.array(userSchema).describe('Lista de usuários'),
            },
        },
    }, () => {
        return users
    })

    app.post('/users', {
        schema: {
            tags: ['users'],
            description: 'Create a new user',
            body: z.object({
                name: z.string(),
                email: z.string().email(),
            }),
            response: {
                201: userSchema.describe('User Created'),
            },
        },
    }, async (request, reply) => {
        const { name, email } = request.body

        const user: User = {
            id: randomUUID(),
            name,
            email,
        }

        users.push(user)

        return reply.status(201).send(user)
    })

    app.post('/agent', {
        schema: {
            tags: ['agent'],
            description: 'Send a message to the LangGraph agent and get a reply',
            body: z.object({
                message: z.string().describe('User message'),
            }),
            response: {
                200: z.object({
                    response: z.string().describe('Agent reply'),
                }),
            },
        },
    }, async (request, reply) => {
        const { message } = request.body
        const response = await runAgent(message)
        return reply.send({ response })
    })
}
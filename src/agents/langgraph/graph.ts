import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { agentEnv } from "./config";

const llm = new ChatOpenAI({
  apiKey: agentEnv.openai.apiKey(),
  model: agentEnv.openai.model(),
  temperature: 0,
});

type State = { messages: BaseMessage[] };

async function llmNode(state: State): Promise<{ messages: [AIMessage] }> {
  const response = await llm.invoke(state.messages);
  const content = typeof response.content === "string" ? response.content : String(response.content);
  return { messages: [new AIMessage(content)] };
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("llm", llmNode)
  .addEdge(START, "llm")
  .addEdge("llm", END);

const compiled = graph.compile();

/**
 * Run the agent with the given user input and return the assistant reply text.
 */
export async function runAgent(userInput: string): Promise<string> {
  const result = await compiled.invoke({
    messages: [new HumanMessage(userInput)],
  });
  const messages = result.messages ?? [];
  const last = messages[messages.length - 1];
  if (last && "content" in last && typeof last.content === "string") {
    return last.content;
  }
  return "";
}

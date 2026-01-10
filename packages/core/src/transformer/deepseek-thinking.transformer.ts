import { LLMProvider, UnifiedChatRequest } from "../types/llm";
import { Transformer, TransformerContext } from "../types/transformer";

/**
 * DeepSeek Thinking Transformer
 *
 * Handles DeepSeek v3.2 API requirements for reasoning_content field in assistant messages.
 *
 * DeepSeek v3.2 requires:
 * 1. All assistant messages must have reasoning_content field (can be empty string)
 * 2. reasoning_content must be preserved from API responses for multi-turn conversations
 *
 * See: https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
 */
export class DeepseekThinkingTransformer implements Transformer {
  static TransformerName = "deepseek-thinking";
  logger?: any;

  async transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext
  ): Promise<UnifiedChatRequest> {
    // Get model from request body (where it's actually stored)
    const model = (request as any).model;

    // Only apply to deepseek-reasoner model
    const isReasonerModel = model === "deepseek-reasoner";

    if (!isReasonerModel) {
      return request;
    }

    // Ensure all assistant messages have reasoning_content field
    if (request.messages && Array.isArray(request.messages)) {
      request.messages = request.messages.map((msg: any) => {
        if (msg.role === "assistant") {
          // Add empty reasoning_content if missing
          if (
            msg.reasoning_content === undefined ||
            msg.reasoning_content === null
          ) {
            return {
              ...msg,
              reasoning_content: "",
            };
          }
        }
        return msg;
      });
    }

    return request;
  }

  async transformResponseOut(
    response: Response,
    context: TransformerContext
  ): Promise<Response> {
    // This transformer is only applied to deepseek-reasoner via config
    // Handle non-streaming response
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();

      // Ensure reasoning_content exists in response for history preservation
      if (jsonResponse.choices?.[0]?.message) {
        if (!jsonResponse.choices[0].message.reasoning_content) {
          jsonResponse.choices[0].message.reasoning_content = "";
        }
      }

      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // Streaming responses are handled by the deepseek transformer
    return response;
  }
}

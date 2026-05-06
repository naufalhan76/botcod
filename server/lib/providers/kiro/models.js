/**
 * Kiro free-tier model name -> AWS CodeWhisperer model ID mapping.
 *
 * The friendly names on the left are what Sambungin exposes to OpenCode (and
 * other OpenAI clients) via /v1/models. The right-hand side is what we send to
 * CodeWhisperer in `userInputMessage.modelId`.
 *
 * Source: kiro2api config/config.go ModelMap, verified empirically against
 * https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse.
 */
export const KIRO_MODEL_IDS = {
    'claude-sonnet-4.5':     'CLAUDE_SONNET_4_5_20250929_V1_0',
    'claude-sonnet-4':       'CLAUDE_SONNET_4_20250514_V1_0',
    'claude-3.7-sonnet':     'CLAUDE_3_7_SONNET_20250219_V1_0',
    'deepseek-v3.2-kiro':    'DEEPSEEK_V3_2_EXP_V1_0',
    'minimax-m2.5':          'MINIMAX_M2_5_V1_0',
    'minimax-m2.1':          'MINIMAX_M2_FP8_V1_0',
    'glm-5':                 'GLM_5_FP8_V1_0',
    'qwen3-coder-next':      'QWEN3_CODER_NEXT_V1_0'
};

/**
 * The list of friendly model names this provider exposes.
 */
export const KIRO_EXPOSED_MODELS = Object.keys(KIRO_MODEL_IDS);

export function resolveKiroModelId(friendlyName) {
    return KIRO_MODEL_IDS[friendlyName] || null;
}

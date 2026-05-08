export const KIRO_MAX_DESCRIPTION_LENGTH = 1024;

export const UNSUPPORTED_SCHEMA_KEYWORDS = [
    '$ref',
    '$defs',
    'definitions',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'if',
    'then',
    'else',
    'patternProperties'
];

const UNSUPPORTED_KEYWORD_SET = new Set(UNSUPPORTED_SCHEMA_KEYWORDS);
const SENTENCE_BOUNDARY_PATTERN = /[.!?]\s+/g;

/**
 * Strip Kiro-unsupported JSON Schema features and normalize object schemas.
 * @param {unknown} schema
 * @returns {object}
 */
export function sanitizeJsonSchema(schema) {
    const cleanSchema = isPlainObject(schema) ? cloneSupportedSchema(schema) : {};

    if (typeof cleanSchema.type !== 'string' || cleanSchema.type.trim() === '') {
        cleanSchema.type = 'object';
    }

    if (cleanSchema.type === 'object') {
        cleanSchema.properties = sanitizeProperties(cleanSchema.properties);
        cleanSchema.required = Array.isArray(cleanSchema.required)
            ? cleanSchema.required.map(String)
            : [];
    } else if ('properties' in cleanSchema) {
        cleanSchema.properties = sanitizeProperties(cleanSchema.properties);
    }

    if (isPlainObject(cleanSchema.items) || Array.isArray(cleanSchema.items)) {
        cleanSchema.items = sanitizeNestedSchema(cleanSchema.items);
    }

    if (cleanSchema.additionalProperties === false) {
        delete cleanSchema.additionalProperties;
    } else if (isPlainObject(cleanSchema.additionalProperties)) {
        cleanSchema.additionalProperties = sanitizeJsonSchema(cleanSchema.additionalProperties);
    }

    return cleanSchema;
}

/**
 * Add permissive defaults to a sanitized schema for Kiro compatibility.
 * @param {unknown} schema
 * @returns {object}
 */
export function relaxSchemaWithDefaults(schema) {
    const relaxed = sanitizeJsonSchema(schema);
    relaxNestedSchema(relaxed);
    return relaxed;
}

/**
 * Limit tool descriptions without cutting mid-sentence when possible.
 * @param {unknown} description
 * @param {number} maxLen
 * @returns {string}
 */
export function applyToolDescriptionLimit(description, maxLen = KIRO_MAX_DESCRIPTION_LENGTH) {
    const text = typeof description === 'string' ? description.trim() : '';
    const limit = Number.isFinite(maxLen) ? Math.max(0, Math.floor(maxLen)) : KIRO_MAX_DESCRIPTION_LENGTH;
    if (text.length <= limit) return text;
    if (limit <= 3) return '.'.repeat(limit);

    const suffix = '...';
    const bodyLimit = limit - suffix.length;
    const boundary = findLastSentenceBoundary(text, bodyLimit);
    const body = (boundary > 0 ? text.slice(0, boundary) : text.slice(0, bodyLimit)).trimEnd();
    return `${body}${suffix}`;
}

/**
 * Sanitize, relax, and description-limit OpenAI-style tools in one pass.
 * @param {unknown} tools
 * @returns {Array}
 */
export function processToolSchemas(tools) {
    if (!Array.isArray(tools)) return [];
    return tools.map(tool => {
        if (!isPlainObject(tool)) return tool;
        const processedTool = { ...tool };
        const fn = isPlainObject(processedTool.function) ? { ...processedTool.function } : null;

        if (fn) {
            fn.description = applyToolDescriptionLimit(fn.description, KIRO_MAX_DESCRIPTION_LENGTH);
            fn.parameters = relaxSchemaWithDefaults(fn.parameters);
            processedTool.function = fn;
            return processedTool;
        }

        if ('description' in processedTool) {
            processedTool.description = applyToolDescriptionLimit(processedTool.description, KIRO_MAX_DESCRIPTION_LENGTH);
        }
        if ('parameters' in processedTool) {
            processedTool.parameters = relaxSchemaWithDefaults(processedTool.parameters);
        }
        if ('inputSchema' in processedTool) {
            processedTool.inputSchema = relaxSchemaWithDefaults(processedTool.inputSchema);
        }

        return processedTool;
    });
}

function cloneSupportedSchema(schema) {
    const result = {};
    for (const [key, value] of Object.entries(schema)) {
        if (UNSUPPORTED_KEYWORD_SET.has(key)) continue;
        if (key === 'additionalProperties' && value === false) continue;
        if (key === 'properties') {
            result.properties = sanitizeProperties(value);
            continue;
        }
        if (key === 'items') {
            result.items = sanitizeNestedSchema(value);
            continue;
        }
        if (key === 'additionalProperties' && isPlainObject(value)) {
            result.additionalProperties = sanitizeJsonSchema(value);
            continue;
        }
        result[key] = cloneJsonValue(value);
    }
    return result;
}

function sanitizeProperties(properties) {
    if (!isPlainObject(properties)) return {};
    const result = {};
    for (const [name, propertySchema] of Object.entries(properties)) {
        result[name] = sanitizeJsonSchema(propertySchema);
    }
    return result;
}

function sanitizeNestedSchema(value) {
    if (Array.isArray(value)) return value.map(item => sanitizeJsonSchema(item));
    if (isPlainObject(value)) return sanitizeJsonSchema(value);
    return cloneJsonValue(value);
}

function relaxNestedSchema(schema) {
    if (!isPlainObject(schema)) return;

    if (typeof schema.type !== 'string' || schema.type.trim() === '') {
        schema.type = 'object';
    }

    if (schema.type === 'object') {
        if (!isPlainObject(schema.properties)) schema.properties = {};
        if (!Array.isArray(schema.required)) schema.required = [];
        if (schema.additionalProperties !== true) schema.additionalProperties = true;
    }

    if (isPlainObject(schema.properties)) {
        for (const propertySchema of Object.values(schema.properties)) {
            relaxNestedSchema(propertySchema);
        }
    }

    if (Array.isArray(schema.items)) {
        for (const item of schema.items) relaxNestedSchema(item);
    } else if (isPlainObject(schema.items)) {
        relaxNestedSchema(schema.items);
    }

    if (isPlainObject(schema.additionalProperties)) {
        relaxNestedSchema(schema.additionalProperties);
    }
}

function findLastSentenceBoundary(text, maxIndex) {
    SENTENCE_BOUNDARY_PATTERN.lastIndex = 0;
    let boundary = -1;
    let match;
    while ((match = SENTENCE_BOUNDARY_PATTERN.exec(text)) !== null) {
        const candidate = match.index + 1;
        if (candidate > maxIndex) break;
        boundary = candidate;
    }
    return boundary;
}

function cloneJsonValue(value) {
    if (Array.isArray(value)) return value.map(cloneJsonValue);
    if (isPlainObject(value)) {
        const result = {};
        for (const [key, child] of Object.entries(value)) {
            if (UNSUPPORTED_KEYWORD_SET.has(key)) continue;
            if (key === 'additionalProperties' && child === false) continue;
            result[key] = cloneJsonValue(child);
        }
        return result;
    }
    return value;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
}

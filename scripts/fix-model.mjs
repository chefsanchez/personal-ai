import { readFileSync, writeFileSync } from 'node:fs';

let content = readFileSync('src/worker.js', 'utf8');

const target1 = 'reply = JSON.parse(text).choices?.[0]?.message?.content;';
const repl1 = 'const parsed = JSON.parse(text);\n          const msg = parsed.choices?.[0]?.message;\n          reply = msg?.content || msg?.reasoning;';
content = content.replace(target1, repl1);

const target2 = "model: env.VLLM_MODEL || 'nvidia/Qwen3.6-35B-A3B-NVFP4', messages, max_tokens: 800";
const repl2 = "model: env.VLLM_MODEL || 'qwen/qwen-2.5-72b-instruct', messages, max_tokens: 1500";
content = content.replace(target2, repl2);

writeFileSync('src/worker.js', content, 'utf8');
console.log('src/worker.js successfully updated with Qwen 2.5 72B and reasoning fallback!');

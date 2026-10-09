# Local AI Composition

This experimental workflow sends the description, clarification history and current composition to a local text model. It can choose catalog objects or propose geometry made from primitives.

A valid composition is editable and exportable. Correct execution of every prompt is not guaranteed.

## Runtime

The prepared Windows setup uses llama.cpp and **Qwen3-4B-Instruct-2507 Q4_K_M**. Runtime files and weights stay in the ignored `.local-ai` directory.

| File | Location | SHA-256 of the prepared download |
| --- | --- | --- |
| llama.cpp b11429 CPU archive | [Official release](https://github.com/ggml-org/llama.cpp/releases/download/b11429/llama-b11429-bin-win-cpu-x64.zip) | `1283323272b04cd07905816a597a0da810918102de958f4ff6f7bbaa70ed2efe` |
| Qwen GGUF | [Prepared model](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf) | `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597` |

Extract the runtime into `.local-ai/runtime` and save the model as `.local-ai/Qwen3-4B-Instruct-2507-Q4_K_M.gguf`. Verify downloaded files against the expected checksums.

Set `LOCAL_DESIGN_AI_URL=http://127.0.0.1:8081` in `.env.local`. Start these in separate terminals:

```powershell
npm run design:ai
```

```powershell
npm run dev
```

The launcher uses zero GPU layers, six CPU threads, one slot and a 12,288-token context. Runtime availability is checked; a configured URL alone does not prove the process is running.

## Contract

`shared/design/composition.ts` accepts structured clarification or creation responses. Composition nodes use centre position `p`, full sizes `s` in metres and XYZ rotation `r` in degrees, with up to 96 nodes.

The adapter permits loopback HTTP addresses only, one concurrent request, a bounded response and a ten-minute timeout. It does not execute generated code or automatically use an external paid fallback.

The private production route is `/api/design/compose`; development uses the playground route. A Vercel deployment cannot access a runtime on the developer's computer through loopback.

## Evaluation

Local trials produced editable scenes and clarification questions, but also incorrect dimensions, simplified shapes and misplaced furniture. Structure validation is not complete semantic or ergonomic validation.

The workflow remains experimental. Preview and GLB share catalog geometry; composition JSON supports reconstruction. Database persistence of direct compositions is not provided.

Model information: [Qwen model card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507). Runtime reference: [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server).

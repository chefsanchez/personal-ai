# Unsloth Fast LoRA Fine-Tuning Script für Philipps AI
# Voraussetzung auf RunPod: RTX 4090 GPU (PyTorch 2.4+ Template)
# Installation: pip install --no-deps unsloth "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git" trl datasets

import os
from unsloth import FastLanguageModel
import torch
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments

max_seq_length = 2048
dtype = None # Auto detection (Float16 für T4, Bfloat16 für Ampere/Ada Lovelace)
load_in_4bit = True # 4bit Quantisierung spart 80% VRAM (benötigt nur ca. 6GB auf RTX 4090)

print("🚀 Lade Basis-Modell Qwen 2.5 7B Instruct...")
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/Qwen2.5-7B-Instruct",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

print("⚙️ Konfiguriere LoRA-Adapter für Philipps Persona...")
model = FastLanguageModel.get_peft_model(
    model,
    r = 16, # LoRA Rang
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha = 16,
    lora_dropout = 0, # Unsloth unterstützt optimiertes 0 Dropout
    bias = "none",
    use_gradient_checkpointing = "unsloth", # Spart massiv VRAM
    random_state = 3407,
)

print("📂 Lade Trainingsdatensatz...")
dataset = load_dataset("json", data_files={"train": "philipp_dataset.jsonl"}, split="train")

def formatting_prompts_func(examples):
    convos = examples["messages"]
    texts = [tokenizer.apply_chat_template(convo, tokenize=False, add_generation_prompt=False) for convo in convos]
    return { "text" : texts }

dataset = dataset.map(formatting_prompts_func, batched = True)

print("🔥 Starte LoRA Training...")
trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 2,
    packing = False,
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        max_steps = 60, # ca. 3 Epochen bei 50 Beispielen (dauert ca. 15-20 Min)
        learning_rate = 2e-4,
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 1,
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
        seed = 3407,
        output_dir = "outputs",
    ),
)

trainer.train()

print("💾 Speichere fertigen LoRA-Adapter...")
model.save_pretrained("philipp_lora_adapter")
tokenizer.save_pretrained("philipp_lora_adapter")
print("✅ Training erfolgreich abgeschlossen! Adapter liegt in ./philipp_lora_adapter")

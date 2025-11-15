import torch
import torch.nn.functional as F
import xformers.ops.fmha as fmha
from xformers.ops.fmha.attn_bias import (
    BlockDiagonalCausalLocalAttentionMask,
    BlockDiagonalMask,
    BlockDiagonalCausalWithOffsetPaddedKeysMask
)

# --- 1. Patch pour la fonction d'attention sur CPU ---
def memory_efficient_attention_cpu(query, key, value, attn_bias=None, p=0.0, *args, **kwargs):
    attn_scores = torch.matmul(query, key.transpose(-2, -1))
    if attn_bias is not None:
        if isinstance(attn_bias, torch.Tensor):
            attn_scores += attn_bias
        elif isinstance(attn_bias, (BlockDiagonalCausalLocalAttentionMask, BlockDiagonalMask, BlockDiagonalCausalWithOffsetPaddedKeysMask)):
            # On ignore ces masques pour forcer une attention globale sur CPU
            pass
        else:
            raise TypeError(f"Type de masque inattendu : {type(attn_bias)}")
    if p > 0.0:
        attn_scores = F.dropout(attn_scores, p=p)
    attn_probs = F.softmax(attn_scores, dim=-1)
    return torch.matmul(attn_probs, value)

fmha.memory_efficient_attention = lambda *args, **kwargs: memory_efficient_attention_cpu(*args, **kwargs)


# --- 2. Patch dynamique pour tous les modules d'attention ---
def patch_transformer_modules(module, patched=set()):
    """
    Parcourt récursivement les sous-modules de 'module' et remplace leur méthode forward
    pour forcer un reshape dynamique via view(computed_tokens, expected) quand aucun cache n'est actif.
    """
    for name, child in module.named_children():
        if hasattr(child, "n_heads") and hasattr(child, "head_dim") and hasattr(child, "forward"):
            if id(child) in patched:
                continue
            patched.add(id(child))
            original_forward = child.forward

            def new_forward(x, freqs_cis, cache, original_forward=original_forward, child=child):
                output = original_forward(x, freqs_cis, cache)
                if cache is not None:
                    return output
                expected = child.n_heads * child.head_dim
                total = output.numel()
                computed_tokens = total // expected
                print(f"[DEBUG PATCH] {child.__class__.__name__}: total_elements={total}, expected={expected}, computed_tokens={computed_tokens}")
                try:
                    output = output.contiguous()
                    return output.view(computed_tokens, expected)
                except Exception as e:
                    print(f"Erreur lors du reshape dans {child.__class__.__name__}: {e}")
                    raise e

            child.forward = new_forward
        patch_transformer_modules(child, patched)


# --- 3. Patch spécifique pour transformer_layers.Attention ---
try:
    from mistral_inference import transformer_layers
    OriginalAttentionForward = transformer_layers.Attention.forward

    def new_attention_forward(self, x, freqs_cis, cache):
        # Appel de la fonction d'attention originale
        output = OriginalAttentionForward(self, x, freqs_cis, cache)
        expected = self.n_heads * self.head_dim
        total = output.numel()
        correct_tokens = total // expected
        # Si la première dimension n'est pas celle attendue, la recalculer
        if output.shape[0] != correct_tokens:
            print(f"[DEBUG ATTENTION] Correction du reshape : forme actuelle {output.shape[0]}, attendue {correct_tokens}")
            output = output.view(correct_tokens, expected)
        return output

    transformer_layers.Attention.forward = new_attention_forward
    print("Patch appliqué sur transformer_layers.Attention.forward")
except Exception as e:
    print("Erreur lors du patch de transformer_layers.Attention:", e)

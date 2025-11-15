import types
import torch
import torch.nn.functional as F

#
# --- Définition des classes "dummy" attendues par Mistral / xformers ---
#

class BlockDiagonalCausalLocalAttentionMask:
    pass

class BlockDiagonalMask:
    pass

class BlockDiagonalCausalMask:
    """Dummy pour BlockDiagonalCausalMask avec gestion flexible des paramètres."""
    def __init__(self, cache_size, seqlens, seqpos):
        self.cache_size = cache_size
        self.seqlens = seqlens
        self.seqpos = seqpos

    @staticmethod
    def from_seqlens(*args, **kwargs):
        """
        Accepte tous les paramètres sous forme d'args/kwargs 
        et fournit des valeurs par défaut.
        """
        cache_size = kwargs.get("cache_size", 1)
        seqlens    = kwargs.get("seqlens", [1])
        seqpos     = kwargs.get("seqpos", [0])
        return BlockDiagonalCausalMask(cache_size, seqlens, seqpos)
    
    def make_local_attention(self, cache_size):
        """
        Retourne un masque (tensor de zéros) de dimension 
        (total_length, total_length).
        """
        total_length = sum(self.seqlens) if self.seqlens else cache_size
        return torch.zeros(total_length, total_length, dtype=torch.float16)

class BlockDiagonalCausalWithOffsetPaddedKeysMask:
    """Dummy pour BlockDiagonalCausalWithOffsetPaddedKeysMask avec gestion flexible."""
    def __init__(self, cache_size, seqlens, seqpos):
        self.cache_size = cache_size
        self.seqlens = seqlens
        self.seqpos = seqpos

    @staticmethod
    def from_seqlens(*args, **kwargs):
        """
        Même logique que BlockDiagonalCausalMask, on prend 
        cache_size, seqlens, seqpos depuis kwargs.
        """
        cache_size = kwargs.get("cache_size", 1)
        seqlens    = kwargs.get("seqlens", [1])
        seqpos     = kwargs.get("seqpos", [0])
        return BlockDiagonalCausalWithOffsetPaddedKeysMask(cache_size, seqlens, seqpos)
    
    def make_local_attention(self, cache_size):
        total_length = sum(self.seqlens) if self.seqlens else cache_size
        return torch.zeros(total_length, total_length, dtype=torch.float16)

class AttentionBias:
    pass

#
# --- Création d'un sous-module attn_bias contenant les classes ci-dessus ---
#

attn_bias = types.ModuleType("attn_bias")
attn_bias.BlockDiagonalCausalLocalAttentionMask = BlockDiagonalCausalLocalAttentionMask
attn_bias.BlockDiagonalMask = BlockDiagonalMask
attn_bias.BlockDiagonalCausalMask = BlockDiagonalCausalMask
attn_bias.BlockDiagonalCausalWithOffsetPaddedKeysMask = BlockDiagonalCausalWithOffsetPaddedKeysMask
attn_bias.AttentionBias = AttentionBias

#
# --- Définition d'une fonction "dummy" pour memory_efficient_attention ---
#

def memory_efficient_attention(query, key, value, attn_bias=None, p=0.0, **kwargs):
    """
    Implémentation CPU simplifiée de l'attention.
    """
    attn_scores = torch.matmul(query, key.transpose(-2, -1))
    if p > 0.0:
        attn_scores = F.dropout(attn_scores, p=p)
    attn_probs = torch.softmax(attn_scores, dim=-1)
    return torch.matmul(attn_probs, value)

#
# --- Création du sous-module fmha ---
#

fmha = types.ModuleType("fmha")
fmha.attn_bias = attn_bias
fmha.memory_efficient_attention = memory_efficient_attention

#
# --- Création du sous-module ops ---
#

ops = types.ModuleType("ops")
ops.fmha = fmha

#
# --- Création du module xformers ---
#

xformers = types.ModuleType("xformers")
xformers.ops = ops

#
# --- Création d'un module dummy pour xformers._cpp_lib ---
#

dummy_cpp_lib = types.ModuleType("_cpp_lib")
dummy_cpp_lib._register_extensions = lambda: None
dummy_cpp_lib.xFormersInvalidLibException = Exception
dummy_cpp_lib._cpp_library_load_exception = None
dummy_cpp_lib._built_with_cuda = False
xformers._cpp_lib = dummy_cpp_lib

# 
# --- Exposer le module dummy complet ---
#

dummy_xformers = xformers

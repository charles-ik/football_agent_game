"""Generic dataclass <-> JSON conversion.

Kept deliberately small and type-hint driven so model classes stay free of
hand-written serialisation boilerplate. Supports dataclasses, enums, lists,
dicts (including int keys, which JSON stringifies), Optional and tuples.
"""

from __future__ import annotations

import dataclasses
import enum
import typing
from typing import Any, get_args, get_origin


def encode(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {f.name: encode(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): encode(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [encode(v) for v in value]
    return value


def _is_optional(tp: Any) -> bool:
    return get_origin(tp) is typing.Union and type(None) in get_args(tp)


def _strip_optional(tp: Any) -> Any:
    args = [a for a in get_args(tp) if a is not type(None)]
    return args[0] if len(args) == 1 else tp


def decode(tp: Any, value: Any) -> Any:
    if value is None:
        return None
    if _is_optional(tp):
        tp = _strip_optional(tp)

    origin = get_origin(tp)

    if origin in (list, set, tuple):
        args = get_args(tp)
        if origin is tuple and len(args) == 2 and args[1] is Ellipsis:
            return tuple(decode(args[0], v) for v in value)
        if origin is tuple:
            return tuple(decode(a, v) for a, v in zip(args, value))
        inner = args[0] if args else Any
        built = [decode(inner, v) for v in value]
        return set(built) if origin is set else built

    if origin is dict:
        key_t, val_t = get_args(tp) if get_args(tp) else (str, Any)
        out = {}
        for k, v in value.items():
            key = int(k) if key_t is int else k
            out[key] = decode(val_t, v)
        return out

    if isinstance(tp, type) and issubclass(tp, enum.Enum):
        return tp(value)

    if dataclasses.is_dataclass(tp):
        hints = typing.get_type_hints(tp)
        kwargs = {}
        for f in dataclasses.fields(tp):
            if f.name in value:
                kwargs[f.name] = decode(hints[f.name], value[f.name])
        return tp(**kwargs)

    return value

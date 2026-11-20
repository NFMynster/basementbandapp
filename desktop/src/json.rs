//! Small helpers for engine JSON, which is loosely shaped and read field by
//! field. They mirror the JavaScript semantics the session format grew up
//! with: missing keys behave like `undefined`, and `{ ...a, ...b }` merges.

use serde_json::{Map, Value};

/// JavaScript truthiness for a possibly missing field.
pub fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// `value.op` as text, or "" when missing.
pub fn op(value: &Value) -> &str {
    value.get("op").and_then(Value::as_str).unwrap_or("")
}

/// `${value || ""}` for template strings.
pub fn text_or_empty(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(v) if truthy(Some(v)) => match v {
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            other => other.to_string(),
        },
        _ => String::new(),
    }
}

/// `{ ...base, ...overrides }` for objects; non-objects contribute nothing.
pub fn merge(base: Option<&Value>, overrides: &Value) -> Value {
    let mut merged = match base {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    };
    if let Value::Object(map) = overrides {
        for (key, value) in map {
            merged.insert(key.clone(), value.clone());
        }
    }
    Value::Object(merged)
}

/// Sets `key`, or removes it when `value` is `None` (assigning `undefined`).
pub fn assign(target: &mut Value, key: &str, value: Option<Value>) {
    if let Value::Object(map) = target {
        match value {
            Some(value) => {
                map.insert(key.to_owned(), value);
            }
            None => {
                map.shift_remove(key);
            }
        }
    }
}

pub fn remove(target: &mut Value, key: &str) {
    assign(target, key, None);
}

/// The array at `key`, or an empty slice.
pub fn array<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

pub fn array_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Vec<Value>> {
    value.get_mut(key).and_then(Value::as_array_mut)
}

/// The `id` field compared as JavaScript `===` would for string ids.
pub fn id(value: &Value) -> Option<&Value> {
    value.get("id")
}

pub fn find_by_id<'a>(items: &'a [Value], wanted: Option<&Value>) -> Option<&'a Value> {
    items.iter().find(|item| id(item) == wanted)
}

/// Same key under JavaScript string coercion, used for map lookups by id.
pub fn id_key(value: &Value) -> String {
    match value.get("id") {
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
        None => String::from("undefined"),
    }
}

/// Error text for a failed filesystem operation, with the path it touched.
pub fn io_error(action: &str, path: &std::path::Path, error: std::io::Error) -> String {
    format!("{action} {}: {error}", path.display())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_overrides_in_place_and_appends_new_keys() {
        let merged = merge(Some(&json!({"a": 1, "b": 2})), &json!({"b": 3, "c": 4}));
        assert_eq!(
            serde_json::to_string(&merged).unwrap(),
            r#"{"a":1,"b":3,"c":4}"#
        );
    }

    #[test]
    fn truthiness_matches_javascript() {
        assert!(!truthy(None));
        assert!(!truthy(Some(&json!(0))));
        assert!(!truthy(Some(&json!(""))));
        assert!(truthy(Some(&json!("x"))));
        assert!(truthy(Some(&json!([]))));
    }
}

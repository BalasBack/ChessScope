use crate::models::{CoachMessage, OllamaStatus};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const OLLAMA_URL: &str = "http://127.0.0.1:11434";

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMsg>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMsg {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: ChatMsg,
}

fn ollama_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())
}

pub async fn check_status() -> OllamaStatus {
    let client = match ollama_client(Duration::from_secs(5)) {
        Ok(c) => c,
        Err(e) => {
            return OllamaStatus {
                connected: false,
                models: vec![],
                error: Some(e.to_string()),
            }
        }
    };

    match client.get(format!("{OLLAMA_URL}/api/tags")).send().await {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<TagsResponse>().await {
                Ok(tags) => OllamaStatus {
                    connected: true,
                    models: tags.models.into_iter().map(|m| m.name).collect(),
                    error: None,
                },
                Err(e) => OllamaStatus {
                    connected: false,
                    models: vec![],
                    error: Some(e.to_string()),
                },
            }
        }
        Ok(resp) => OllamaStatus {
            connected: false,
            models: vec![],
            error: Some(format!("Ollama returned {}", resp.status())),
        },
        Err(_) => OllamaStatus {
            connected: false,
            models: vec![],
            error: Some(
                "Ollama not running. Install from ollama.com and run: ollama pull llama3.1"
                    .to_string(),
            ),
        },
    }
}

pub async fn chat(
    model: &str,
    messages: &[CoachMessage],
    profile_summary: &str,
) -> Result<String, String> {
    let client = ollama_client(Duration::from_secs(180))?;

    let system = format!(
        "You are ChessScope AI Coach, an expert chess coach helping a serious tournament player prepare for USCF and FIDE events. \
         Be concrete, actionable, and cite statistics from the player profile when relevant. \
         Focus on OTB tournament preparation: openings, time management, tactical patterns, and opponent prep. \
         Keep responses concise (2-4 paragraphs unless asked for detail).\n\n\
         PLAYER PROFILE DATA:\n{profile_summary}"
    );

    let mut chat_messages = vec![ChatMsg {
        role: "system".to_string(),
        content: system,
    }];
    for msg in messages {
        chat_messages.push(ChatMsg {
            role: msg.role.clone(),
            content: msg.content.clone(),
        });
    }

    let request = ChatRequest {
        model: model.to_string(),
        messages: chat_messages,
        stream: false,
    };

    let response = send_chat(&client, &request).await?;

    if response.status() == reqwest::StatusCode::NOT_FOUND && !model.contains(':') {
        let retry = ChatRequest {
            model: format!("{model}:latest"),
            messages: request.messages,
            stream: false,
        };
        return parse_chat_response(send_chat(&client, &retry).await?).await;
    }

    parse_chat_response(response).await
}

async fn send_chat(
    client: &reqwest::Client,
    request: &ChatRequest,
) -> Result<reqwest::Response, String> {
    client
        .post(format!("{OLLAMA_URL}/api/chat"))
        .json(request)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}. Is Ollama running?"))
}

async fn parse_chat_response(response: reqwest::Response) -> Result<String, String> {
    if !response.status().is_success() {
        let status = response.status();
        let mut body = response.text().await.unwrap_or_default();
        if body.len() > 300 {
            body.truncate(300);
            body.push_str("…");
        }
        return Err(format!(
            "Ollama error ({status}): {}",
            if body.is_empty() {
                "unknown error — check that the model is pulled (ollama pull)".to_string()
            } else {
                body
            }
        ));
    }

    let chat_resp: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid Ollama response: {e}"))?;

    let content = chat_resp.message.content.trim();
    if content.is_empty() {
        return Err(
            "Ollama returned an empty response. Try selecting a different model in the sidebar."
                .to_string(),
        );
    }

    Ok(content.to_string())
}

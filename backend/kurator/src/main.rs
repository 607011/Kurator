/**
 * Copyright (c) 2022 Oliver Lau <oliver@ersatzworld.net>
 * All rights reserved.
 */
use db::{
    with_db, Word, DB,
};
use dotenv::dotenv;
use log;
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;
use std::net::SocketAddr;
use warp::{http::StatusCode, reject, reply::WithStatus, Filter, Rejection, Reply};

mod db;
mod error;

type Result<T> = std::result::Result<T, error::Error>;
type WebResult<T> = std::result::Result<T, Rejection>;

#[derive(Deserialize,Debug)]
pub struct AddWordRequest {
    pub word: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Deserialize, Debug)]
pub struct DeleteWordRequest {
    pub word: String,
}

#[derive(Serialize, Debug)]
pub struct StatusResponse {
    pub ok: bool,
    pub message: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct CorpusResponse {
    pub ok: bool,
    pub message: Option<String>,
    pub words: Vec<Word>,
}

#[allow(dead_code)]
fn err_response(message: Option<String>) -> WithStatus<warp::reply::Json> {
    let reply = warp::reply::json(&json!(&StatusResponse {
        ok: false,
        message: message,
    }));
    warp::reply::with_status(reply, StatusCode::OK)
}

pub async fn corpus_handler(db: DB) -> WebResult<impl Reply> {
    let words = match db.get_corpus().await {
        Ok(words) => words,
        Err(e) => return Err(reject::custom(e)),
    };
    let reply: warp::reply::Json = warp::reply::json(&json!(&CorpusResponse {
        ok: true,
        message: Option::default(),
        words,
    }));
    Ok(warp::reply::with_status(reply, StatusCode::OK))
}

pub async fn add_word_handler(db: DB, body: AddWordRequest) -> WebResult<impl Reply> {
    match db
        .add_word(&Word{word: body.word, description: body.description, tags: body.tags})
        .await
    {
        Ok(()) => (),
        Err(e) => return Err(reject::custom(e)),
    }
    let reply: warp::reply::Json = warp::reply::json(&json!(&StatusResponse {
        ok: true,
        message: Option::default(),
    }));
    Ok(warp::reply::with_status(reply, StatusCode::OK))
}

pub async fn delete_word_handler(db: DB, body: DeleteWordRequest) -> WebResult<impl Reply> {
    let word = body.word;
    match db
        .delete_word(&word)
        .await
    {
        Ok(()) => (),
        Err(e) => return Err(reject::custom(e)),
    }
    let reply: warp::reply::Json = warp::reply::json(&json!(&StatusResponse {
        ok: true,
        message: Option::default(),
    }));
    Ok(warp::reply::with_status(reply, StatusCode::OK))
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();
    dotenv().ok();
    const CARGO_PKG_NAME: &str = env!("CARGO_PKG_NAME");
    const CARGO_PKG_VERSION: &str = env!("CARGO_PKG_VERSION");
    log::info!("{} {}", CARGO_PKG_NAME, CARGO_PKG_VERSION);
    log::info!("Trying to connect to database ...");
    let db = DB::init().await?;
    db.get_database()
        .run_command(doc! {"ping": 1u32}, None)
        .await?;
    log::info!("Connected successfully.");
    let root = warp::path::end().map(|| "API root.");
    /* Routes accessible to all users */
    let corpus_route = warp::path!("corpus")
        .and(warp::get())
        .and(with_db(db.clone()))
        .and_then(corpus_handler);
    let add_word_route = warp::path!("word" / "add")
        .and(warp::post())
        .and(with_db(db.clone()))
        .and(warp::body::json())
        .and_then(add_word_handler);
    let delete_word_route = warp::path!("word" / "delete")
        .and(warp::post())
        .and(with_db(db.clone()))
        .and(warp::body::json())
        .and_then(delete_word_handler);
    let routes = root
        .or(corpus_route)
        .or(add_word_route)
        .or(delete_word_route)
        .or(warp::any().and(warp::options()).map(warp::reply))
        .recover(error::handle_rejection);

    let host = env::var("API_HOST").expect("API_HOST is not in .env file");
    let addr: SocketAddr = host.parse().expect("Cannot parse host address");
    log::info!("Listening on http://{}", host);
    warp::serve(routes).run(addr).await;
    Ok(())
}

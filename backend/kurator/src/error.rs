/**
 * Copyright (c) 2022 Oliver Lau <oliver@ersatzworld.net>
 * All rights reserved.
 */
use log;
use serde::Serialize;
use std::convert::Infallible;
use thiserror::Error;
use warp::{http::StatusCode, Rejection, Reply};

#[derive(Error, Debug)]
pub enum Error {
    #[error("mongodb error: {0}")]
    MongoError(#[from] mongodb::error::Error),
    #[error("error during mongodb query: {0}")]
    MongoQueryError(mongodb::error::Error),
    #[error("could not access field in document: {0}")]
    MongoDataError(#[from] bson::document::ValueAccessError),
    #[error("could not parse ObjectID {0}")]
    BsonOidError(#[from] bson::oid::Error),
    #[error("invalid id used: {0}")]
    InvalidIDError(String),
    #[error("data base query error: {0}")]
    DatabaseQueryError(String),
    #[error("word not found error")]
    WordNotFoundError,
    #[error("hashing error")]
    HashingError,
    #[error("password must be at least 8 characters long")]
    PasswordTooShortError,
    #[error("unsafe password")]
    UnsafePasswordError,
}

#[derive(Serialize, Debug)]
struct ErrorResponse {
    ok: bool,
    code: u16,
    status: String,
    message: String,
}

impl warp::reject::Reject for Error {}

pub async fn handle_rejection(err: Rejection) -> std::result::Result<impl Reply, Infallible> {
    dbg!(&err);
    let (code, message) = if err.is_not_found() {
        (StatusCode::NOT_FOUND, "Not Found".to_string())
    } else if let Some(e) = err.find::<Error>() {
        match e {
            Error::UnsafePasswordError => (StatusCode::CONFLICT, e.to_string()),
            _ => (StatusCode::BAD_REQUEST, e.to_string()),
        }
    } else if err
        .find::<warp::filters::body::BodyDeserializeError>()
        .is_some()
    {
        (StatusCode::BAD_REQUEST, "BodyDeserializeError".to_string())
    } else if err.find::<warp::reject::MethodNotAllowed>().is_some() {
        (
            StatusCode::METHOD_NOT_ALLOWED,
            "Method Not Allowed".to_string(),
        )
    } else {
        log::error!("unhandled error: {:?}", err);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal Server Error".to_string(),
        )
    };
    let json = warp::reply::json(&ErrorResponse {
        ok: false,
        code: code.as_u16(),
        status: code.to_string(),
        message: message,
    });
    Ok(warp::reply::with_status(json, code))
}

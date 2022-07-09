/**
 * Copyright (c) 2022 Oliver Lau <oliver@ersatzworld.net>
 * All rights reserved.
 */
use crate::{error::Error::*, Result};
use log;
use mongodb::bson::doc;
use mongodb::options::{ClientOptions};
use mongodb::{Client, Collection, Database};
use futures::stream::{TryStreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::env;
use warp::Filter;


#[derive(Deserialize, Serialize, Debug)]
pub struct Word {
    pub word: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
pub struct DB {
    pub client: Client,
    pub name: String,
    pub coll_words: String,
}

impl DB {
    pub async fn init() -> Result<Self> {
        let url: String = env::var("DB_URL").expect("DB_URL is not in .env file");
        let name: String = env::var("DB_NAME").expect("DB_NAME is not in .env file");
        let coll_words: String =
            env::var("DB_COLL_WORDS").expect("DB_COLL_USERS is not in .env file");
        let mut client_options: mongodb::options::ClientOptions =
            ClientOptions::parse(url).await.unwrap();
        client_options.app_name = Some(name.to_string());
        Ok(Self {
            client: Client::with_options(client_options).unwrap(),
            name: name.to_string(),
            coll_words: coll_words.to_string(),
        })
    }

    pub fn get_database(&self) -> Database {
        self.client.database(&self.name)
    }

    pub fn get_words_coll(&self) -> Collection<Word> {
        self.get_database().collection::<Word>(&self.coll_words)
    }

    pub async fn get_corpus(&self) -> Result<Vec<Word>> {
        log::info!("get_corpus()");
        let cursor: mongodb::Cursor<Word> = match self
            .get_words_coll()
            .find(None, None)
            .await
        {
            Ok(cursor) => cursor,
            Err(e) => {
                log::error!("{:?}", &e);
                return Err(MongoQueryError(e));
            }
        };
        let words = match cursor.try_collect().await {
            Ok(words) => words,
            Err(e) => return Err(MongoError(e)),
        };
        Ok(words)
    }

    pub async fn get_word(&self, word: &String) -> Result<Word> {
        log::info!("get_word(); word = {}", word);
        let user: Option<Word> = match self
            .get_words_coll()
            .find_one(doc! { "word": word }, None)
            .await
        {
            Ok(user) => user,
            Err(e) => {
                log::error!("{:?}", &e);
                return Err(MongoQueryError(e));
            }
        };
        match user {
            Some(user) => Ok(user),
            None => Err(WordNotFoundError),
        }
    }

    pub async fn add_word(&self, word: &Word) -> Result<()> {
        log::info!("add_word(); word = »{}«", word.word);
        match self.get_words_coll().insert_one(word, None).await {
            Ok(_) => Ok(()),
            Err(e) => Err(MongoQueryError(e)),
        }
    }

    pub async fn delete_word(&self, word: &String) -> Result<()> {
        log::info!("delete_word(); word = »{}«", word);
        let result = match self.get_words_coll().delete_one(doc! { "word": word }, None).await {
            Ok(result) => result,
            Err(e) => return Err(MongoQueryError(e)),
        };
        log::info!("deleted_count: {}", result.deleted_count);
        Ok(())
    }

    pub async fn create_word(&mut self, word: &Word) -> Result<()> {
        log::info!("create_word(); word = »{}«", word.word);
        match self.get_words_coll().insert_one(word, None).await {
            Ok(_) => Ok(()),
            Err(e) => Err(MongoQueryError(e)),
        }
    }
}

pub fn with_db(db: DB) -> impl Filter<Extract = (DB,), Error = Infallible> + Clone {
    warp::any().map(move || db.clone())
}

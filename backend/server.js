require('dotenv').config();

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Hello world!');
});

app.listen(PORT, () => {
    console.log(`App is running on port ${PORT}`);
});

const { MongoClient } = require('mongodb');

const password = process.env.PASSWORD;
const dbName = 'dynatix-db';
const uri = `mongodb+srv://dynatix:${password}@dynatix-db.mkuq59f.mongodb.net/?retryWrites=true&w=majority&appName=${dbName}`;
const client = new MongoClient(uri);
var db = null;

/* MongoDB Documentation http://mongodb.github.io/node-mongodb-native/4.2/ */
async function connectToDB() {
    await client.connect();
    console.log('Sucessful Connection to DB');
    db = client.db(dbName);
}

connectToDB();

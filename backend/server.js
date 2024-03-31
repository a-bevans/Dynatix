require('dotenv').config();
const bodyparser = require('body-parser');
const express = require('express');
const qr = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyparser.json());

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

/* GET tickets associated with phone number*/
app.get('/myTickets', (request, response) => {
    var phoneNumber = request.query.phoneNumber;

    db.collection("users").findOne({phoneNumber: phoneNumber}).then((result) => {
        if (!result) {
            response.status(404).send("User with the following phone number does not exist.");
        } else {
            
            var obj = {"_id": result["_id"]? result["_id"]: "", "codes": result["codes"]? result["codes"]:[]};

            response.status(200).send(JSON.stringify(obj));
        }
    })
})

/* GET ticket details*/
app.get('/myTickets/:ticketID', (request, response) => {
    var ticketID = request.params.ticketID;
    var phoneNumber = request.query.phoneNumber;

    db.collection("users").findOne({phoneNumber: phoneNumber}).then((result) => {
        if (!result) {
            response.status(404).send("User with the following phone number does not exist.");
        } else {
            const ticket = result.codes.find(code => code._ticketID === ticketID);

            if (!ticket) {
                response.status(404).send("Ticket ID is not valid.");
            } else {
                var obj = {"_ticketID": ticket["_ticketID"]? ticket["_ticketID"]: "", "qrCode": ticket["qrCode"]? ticket["qrCode"]:"", "event": ticket["event"]? ticket["event"]:"",
                "location": ticket["location"]? ticket["location"]:"", "eventDate": ticket["eventDate"]? ticket["eventDate"]:""};

                response.status(200).send(JSON.stringify(obj));
            }
        }
    })
})

/* PUT transfer tickets profile */
app.put('/transferTickets', (request, response) => {
    var data = request.body;
    var formerOwner = data["old_phoneNumber"];
    var newOwner = data["new_phoneNumber"];
    var ticketID = data["ticketID"];

    db.collection("users").findOne({ phoneNumber: formerOwner, "codes._ticketID" : ticketID }).then((verifyOwnership) => {
        if (!verifyOwnership) {
            response.status(400).send("Original owner is not associated with this ticket.");
        } else {
            db.collection("users").findOne({ phoneNumber: newOwner }).then((result) => {
                const updateOwner = result? db.collection("users").updateOne({ phoneNumber: newOwner }, { $addToSet: { codes: verifyOwnership.codes.find(code => code._ticketID === ticketID) } }):
                db.collection("users").insertOne({ phoneNumber: newOwner, codes: [ticketCode] });

                updateOwner.then((result) => {
                    if(!result) {
                        response.status(400).send("Unable to associate new ticket with " + newOwner);
                    } else {
                        db.collection("users").updateOne({ phoneNumber: formerOwner }, { $pull: { codes: { _ticketID: ticketID} } }).then ((result) => {
                            if(!result) {
                                response.status(400).send("Unable to unlink ticket with " + formerOwner);
                            } else {
                                response.status(200).send("Successfully transferred code to new owner and unlinked from former owner.");
                            }
                        });
                    }
                })
            })
        }
    })
})

/* GET generate new code*/
/* https://www.npmjs.com/package/qrcode */
app.get('/generateQRCode/:ticketID', async (request, response) => {
    var ticketID = request.params.ticketID;
    var phoneNumber = request.query.phoneNumber;
    var dataToEncode = request.query.dataToEncode;

    try {
        const qrImageURL = await qr.toDataURL(dataToEncode);

        db.collection("users").updateOne({ phoneNumber: phoneNumber, "codes._ticketID" : ticketID }, {$set : {"codes.$.qrCode": qrImageURL}}).then((result) => {
            if (!result) {
                response.status(400).send("Unable to generate QR Code.");
            } else {
                response.status(200).send(JSON.stringify(qrImageURL));
            }
        })
    } catch (e) {
        response.status(500).send(JSON.stringify(e));
    }
});

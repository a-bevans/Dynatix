require('dotenv').config();
const bodyparser = require('body-parser');
const express = require('express');
const qr = require('qrcode');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

/* Twilio */ 
const accountSid = process.env.TWILIO_ACC_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SID;

const otpClient = twilio(accountSid, authToken);

app.use(bodyparser.json());
const corsOptions = {
    origin: "http://127.0.0.1:5500",
    credentials: true,
};
app.use(cors(corsOptions));

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

/* GET phone number*/
app.get('/verifyNumber', (request, response) => {
    var phoneNumber = request.query.phoneNumber;

    db.collection("users").findOne({phoneNumber: phoneNumber}).then((result) => {
        if (!result) {
            response.status(404).send("User with the following phone number does not exist.");
        } else {
            response.status(200).send("User exists in the database.");
        }
    })
});

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
        const qrImageURL = await qr.toDataURL(dataToEncode+Math.floor(Math.random() * 10000).toString());

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
})

/*POST send OTP*/
app.post('/sendOTP', (request, response) => {
    var data = request.body;
    var phoneNumber = data["phoneNumber"];

    db.collection("users").findOne({phoneNumber: phoneNumber}).then((result) => {
        if (!result) {
            response.status(404).send("User with the following phone number does not exist.");
        } else {
            otpClient.verify.v2.services(verifySid)
            .verifications.create({ to: "+" + phoneNumber, channel: "sms" })
            .then((verification) => {
                console.log(verification.status);
                response.status(200).send("An OTP has been sent to the user.");
            }).catch(error => {
                console.error('Error sending OTP:', error);
                response.status(500).send("Error sending OTP to user.");
            }) ; 
        }
    })
})

/*POST verify OTP*/
app.post('/verifyOTP', (request, response) => {
    var data = request.body;
    var phoneNumber = data["phoneNumber"];
    var otpCode = data["otpCode"];

    db.collection("users").findOne({phoneNumber: phoneNumber}).then((result) => {
        if (!result) {
            response.status(404).send("User with the following phone number does not exist.");
        } else {
            otpClient.verify.v2.services(verifySid)
            .verificationChecks.create({ to: "+" + phoneNumber, code: otpCode })
            .then((verification_check) => {
                console.log(verification_check.status);
                response.status(200).send("User has been verified.");
            }).catch(error => {
                console.error('Error verifying OTP:', error);
                response.status(500).send("Error verifying OTP to user.");
            }) ; 
        }
    })
})
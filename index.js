// https://docs.racemap.com/data-export-from-racemap/export-api/times#reads-at-virtual-timekeeping-point

import fetch from 'node-fetch';
import { join, dirname } from 'path';
import { Low, JSONFile } from 'lowdb';
import { fileURLToPath } from 'url';
import _ from 'lodash';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(__dirname);


var config = {
    'updateRaceMapTimes': 10000,
    'eventId': '60a3b443f096f800018add7c',
    'apiSecretKey': '56b4508a355779c94e4e1a590fc607fb',
    'boxId': 123,
    'companyId': 7,
    'keepAliveTime': 60000,
    'sendTimes2ServerTime': 15000,
    'getRaceMapDataTime': 15000
};

// load config file
const dbConfig = new Low(new JSONFile(join(__dirname, '\config.json')));
await dbConfig.read();

// initialize database if its empty
if (dbConfig.data != null)
{
    config = dbConfig.data;
}

// Use JSON file for storage
const db = new Low(new JSONFile(join(__dirname, '\data', config.eventId+'.json')));

// Read data from JSON file, this will set db.data content
await db.read();



async function getRaceMapTimes(eventId)
{
    if (eventId == null)
        return null;

    var apiUrl = 'https://racemap.com/api/data/v1/' + eventId + '/times/'; 

    console.log(apiUrl);

    var response = await fetch(apiUrl);
    var responseData = await response.json();

    //console.log(response);
    //console.log(responseData);

    if (responseData !== undefined)
    {
        return (responseData);
    } else {
        return (null);
    }
}


async function saveRaceMapTimes(respData){

    if (respData == undefined)
    {
        console.log("ERROR: no data in saveRaceMapTimes");
        return;
    }

    // iterate over timekeeping points and create boxid
    await _.forEach(respData.timekeepings, function(timeKeepingPoint, key){
        respData.timekeepings[key].boxId = config.boxId + key;
    });


    // check db if their are any data
    if (db.data == null)
    {
        db.data = respData;    
        db.data.t2wtimes = [];
    }  else {
        // update only timekeeping points and starter data
        db.data.timekeepings = respData.timekeepings;
        db.data.starters = respData.starters;
    }

    // iterate over starters 
    await _.forEach(respData.starters, function(starter, key, coll){
        //console.log(starter);       

        // iterate over timekeeping points of starter
        _.forEach(starter.times, function(timeArray, timeKeepingId, times){

            // calc interpolated time from gps points
            calcTimeInterpolated(timeArray, function(timeInter){
                
                if (timeInter != null)
                {                    
                    var timeObj = {};
                    timeObj.startNumber = starter.startNumber;
                    timeObj.timeKeepingId = timeKeepingId;
                    timeObj.timeMs = timeInter.timeMs;
                    timeObj.distanceToSplit = timeInter.distanceToSplit;
                    timeObj.time = timeInter.time;

                    var findElem = _.find(db.data.timekeepings, {'id': timeKeepingId});

                    if (findElem == undefined)
                    {
                        console.log('ERROR: found no boxId for timekeeping Id:' + timeKeepingId);
                    } else {                    
                        timeObj.boxId = findElem.boxId;
                        
                        // search item
                        var index = _.findIndex(db.data.t2wtimes, timeObj);                    

                        if (index == -1)
                        {
                            // flag if we send the data to t2w server successfully
                            timeObj.send2Server = false;
                            // add to db
                            db.data.t2wtimes.push(timeObj);
                        }
                    }
                } else {
                    //console.log('no timing points -> '); console.log(starter);
                }
            });

            
        });

    });
   
    // write file
    await db.write();
}






async function calcTimeInterpolated(times, callback)
{
    //console.log(times);

    await _.forEach(times, function(value){
        value.timeMs = new Date(value.time).valueOf();
    });

      callback(_.head(times));
}


async function getRaceMapData()
{
    console.log('GetRaceMapData for ' + config.eventId);

    // get new data
    var respData = await getRaceMapTimes(config.eventId);

    // save to json file and write file
    await saveRaceMapTimes(respData);

    //
}


// get new times and save to db file
setInterval(getRaceMapData, config.getRaceMapDataTime);
getRaceMapData(config.eventId);


// bbt keep alive
function sendBbtKeepAlive()
{    
    bbtSendKeepAlive(config.boxId, config.companyId, config.apiSecretKey, "");
    //bbtSendRawTime(config.boxId, config.companyId, config.apiSecretKey);
}

setInterval(sendBbtKeepAlive, config.keepAliveTime);
sendBbtKeepAlive();
//bbtSendRawTime(config.boxId, config.companyId, config.apiSecretKey);



setInterval(sendTimes2Server, config.sendTimes2ServerTime);
sendTimes2Server();




async function sendTimes2Server()
{
    if(_.has(db.data, 't2wtimes'))
    {
        var ii=0;
        while (ii < 100) {          

            // check if we have times we should send
            var sendElem = _.find(db.data.t2wtimes, {'send2Server': false});     

            //console.log(sendElem);

            
            // check if we found some new elements
            if (sendElem != undefined)
            {
                var sendRawTime = "event.tag.arrive tag_id=0x"; //300833B2DDD9014000000000, first=2019-10-22T10:10:00.359, rssi=-700",

                var startNumber = "000000000000000000000000" + sendElem.startNumber.toString();
                startNumber = startNumber.substring(startNumber.length - 24);
                

                sendRawTime = sendRawTime + startNumber + ', first=' + sendElem.time.substring(0, sendElem.time.length-1);

                //console.log(sendRawTime);

                var retVal = await bbtSendRawTime(sendElem.boxId, config.companyId, config.apiSecretKey, [sendRawTime]);

                if (retVal)
                {
                    sendElem.send2Server = true;
                }
                ii += 1;
            } else {
                //console.log('break;');
                break; // break
            }
        }

        console.log('Send times to server: ' + ii );

        await db.write();
    }
}




/* EXPORT to module bbt things */
async function bbtSendKeepAlive(boxId, companyId, secretKey, status)
{
    var msg = {
        BoxId: boxId.toString(),
        CompanyId: companyId.toString(),
        Status: status,
        RandomNum: getRandomInt(1,65535),
        //Hash: "13884997006406926136"
        Hash: ""
    };

    //console.log(msg.Hash);
    msg.Hash = bbtCalcHash(msg.BoxId + msg.CompanyId + msg.RandomNum + msg.Status + secretKey);

    var apiUrl = 'http://livetime.sportstiming.dk/LiveService/SetAlive'; 

    var response = await fetch(apiUrl, {
        method: 'POST', 
        body: JSON.stringify(msg),
        headers: {'Content-Type': 'application/json'}
    });
    var responseData = await response.json();

    if (responseData.StatusCode == 0)
    {
        console.log('KeepAlive OK');
    } else {
        console.log('KeepAlive ERROR');
        console.log(msg);
        console.log(response);
        console.log(responseData);
    }       

}


async function bbtSendRawTime(boxId, companyId, secretKey, rawTime)
{
    var msg = {
        BoxId: boxId.toString(),
	    CompanyId: companyId.toString(),
	    RandomNum: getRandomInt(1,65535),
        RawTimes: rawTime
	    //RawTimes: ["event.tag.arrive tag_id=0x300833B2DDD9014000000000, first=2019-10-22T10:10:00.359, rssi=-700",
        //           "event.tag.depart tag_id=0x300833B2DDD9014000000000, last=2019-10-22T10:10:02.276"]
    };

    var rawTimesString = '';
   // msg.RawTimes.forEach(time => function(){rawTimesString = rawTimesString + time;});
    _.forEach(msg.RawTimes, function(value, key){
        rawTimesString = rawTimesString + value;
    });

    msg.Hash = bbtCalcHash(msg.BoxId + msg.CompanyId + msg.RandomNum + msg.RawTimes.length + rawTimesString + secretKey);

    var apiUrl = 'http://livetime.sportstiming.dk/LiveService/SaveRawTime'; 

    //console.log(JSON.stringify(msg));

    var response = await fetch(apiUrl, {
        method: 'POST', 
        body: JSON.stringify(msg),
        headers: {'Content-Type': 'application/json'}
    });
    var responseData = await response.json();

    if (responseData.StatusCode == msg.RawTimes.length)
    {
        console.log('SendRawTime OK');
        return true;
    } else {
        console.log('SendRawTime ERROR');
        console.log(msg);
        console.log(response);
        console.log(responseData);
        return false
    }     

}


function bbtCalcHash(msg)
{
    //var msg = "12373636" + "56b4508a355779c94e4e1a590fc607fb";

    var hashedValue = BigInt(12090758597);

    for (let i = 0; i < msg.length; i++) {
        hashedValue = hashedValue + BigInt(msg.charCodeAt(i));
        hashedValue = hashedValue * BigInt(19820704817);    
        hashedValue = hashedValue % BigInt(Math.pow(2,64) -1 )   ;

    }

    //console.log(msg +'-> HASH: ' + hashedValue);

    return hashedValue.toString();
}


function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }


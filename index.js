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
    'raceMapEventId': '60a3b443f096f800018add7c',
    't2wApiSecretKey': '56b4508a355779c94e4e1a590fc607fb',
    'boxId': 123,
    't2wCompanyId': 7,
    'keepAliveTime': 60000,
    'sendTimes2ServerTime': 15000,
    'getRaceMapDataTime': 15000,
    'filterTime': 120
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
const db = new Low(new JSONFile(join(__dirname, '\data', config.raceMapEventId+'.json')));

// Read data from JSON file, this will set db.data content
await db.read();



// get new times and save to db file
setInterval(getRaceMapData, config.getRaceMapDataTime);
getRaceMapData();



setInterval(sendBbtKeepAlive, config.keepAliveTime);
sendBbtKeepAlive();


setInterval(sendTimes2Server, config.sendTimes2ServerTime);
sendTimes2Server();




/*
* Get times from RaceMap Api
*
*/
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
            filterTimes(timeArray, function(filteredTimeArray){
                
                _.forEach(filteredTimeArray, function(value, key){

                    if (value != null)
                    {                    
                        var timeObj = {};
                        timeObj.startNumber = starter.startNumber;
                        timeObj.timeKeepingId = timeKeepingId;
                        timeObj.timeMs = value.timeMs;
                        timeObj.distanceToSplit = value.distanceToSplit;
                        timeObj.time = value.time;
                        timeObj.type = value.type;
    
                        // look if we have for the hash timekeeping point a box id
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
    });
   
    // write file
    await db.write();
}

/*
* filter times for FS, Bs, LS
*/
async function filterTimes(times, callback)
{
    //console.log(times);
    var filteredTimesBS = [];
    var filteredTimesFS = [];
    var filteredTimesLS = [];
    var lastTime = 0;
    
    if (times != null)
    {
        for (var ii=0; ii < times.length; ii++)
        {
            // calculate time in milliseconds from some date
            times[ii].timeMs = new Date(times[ii].time).valueOf();

            if (ii==0)
            {
                filteredTimesBS.push(Object.assign({}, times[ii]));
                filteredTimesFS.push(Object.assign({}, times[ii]));
                filteredTimesLS.push(Object.assign({}, times[ii]));
                //lastTime = times[ii].timeMs;
            } else {

                // check if it is within the filter time
                if (Math.abs(lastTime - times[ii].timeMs) < (config.filterTime*1000)) // -> is within the filter time
                {
                    // check if position is less then the current one
                    if (times[ii].distanceToSplit < _.last(filteredTimesBS).distanceToSplit)
                    {
                        // save new best seen 
                        filteredTimesBS[filteredTimesBS.length-1] = Object.assign({}, times[ii]);     
                    }
                    filteredTimesLS[filteredTimesLS.length-1] = Object.assign({}, times[ii]);

                } else {
                    // not in filter time
                    filteredTimesBS.push(Object.assign({}, times[ii]));
                    filteredTimesFS.push(Object.assign({}, times[ii]));
                    filteredTimesLS.push(Object.assign({}, times[ii]));
                }

            }

            lastTime = times[ii].timeMs;

        }

    }

    var filteredTimes = [];

    for (var kk=0; kk<filteredTimesBS.length; kk++){
        

        filteredTimes.push(filteredTimesBS[kk]);

        _.last(filteredTimes).type = 'BS';
    }
    for (var ll=0; ll<filteredTimesFS.length; ll++){
       

        filteredTimes.push(filteredTimesFS[ll]);

        _.last(filteredTimes).type = 'FS';
    }
    for (var nn=0; nn<filteredTimesLS.length; nn++){
       
        filteredTimes.push(filteredTimesLS[nn]);

        _.last(filteredTimes).type = 'LS';
    }

    callback(filteredTimes);
}


/*
* get data and save new ones into db
*/
async function getRaceMapData()
{
    console.log('GetRaceMapData for ' + config.raceMapEventId);

    // get new data
    var respData = await getRaceMapTimes(config.raceMapEventId);

    // save to json file and write file
    await saveRaceMapTimes(respData);

    //
}





/*
* send keep alive for all splits/boxes
*/
async function sendBbtKeepAlive()
{
    if (db.data != null)
    {
        // send for all boxes the keep alive signal
        _.forEach(db.data.timekeepings, function(value, key){
            bbtSendKeepAlive(value.boxId, config.t2wCompanyId, config.t2wApiSecretKey, "");
        });   
        //bbtSendRawTime(config.boxId, config.companyId, config.apiSecretKey);
    }
}

/*
* check if there are new times and send to server
*/
async function sendTimes2Server()
{
    if(_.has(db.data, 't2wtimes'))
    {
        var nrSendTimes = _.size(_.filter(db.data.t2wtimes, {'send2Server': false}));
        var allTimes    = _.size(db.data.t2wtimes);

        console.log('Send times to server: ' + nrSendTimes +" / " + allTimes);

        var ii=0;
        while (ii < 100) {          

            // check if we have times we should send
            var sendElem = _.find(db.data.t2wtimes, {'send2Server': false});     

            // check if we found some new elements
            if (sendElem != undefined)
            {
                var startNumber = "000000000000000000000000" + sendElem.startNumber.toString();
                startNumber = startNumber.substring(startNumber.length - 24);
                
                var sendRawTime = "event.tag.";

                if (sendElem.type == 'FS')
                {
                    sendRawTime += "arrive tag_id=0x" + startNumber + ', first=' + sendElem.time.substring(0, sendElem.time.length-1);
                } else if (sendElem.type == 'BS') {
                    sendRawTime += "best tag_id=0x" + startNumber + ', best=' + sendElem.time.substring(0, sendElem.time.length-1);
                } else if (sendElem.type == 'LS') {
                    sendRawTime += "depart tag_id=0x" + startNumber + ', last=' + sendElem.time.substring(0, sendElem.time.length-1);
                } else {
                    console.log("ERROR: wrong type. have to be FS,LS,BS");
                    break;
                }
                
                var retVal = await bbtSendRawTime(sendElem.boxId, config.t2wCompanyId, config.t2wApiSecretKey, [sendRawTime]);

                if (retVal)
                {
                    sendElem.send2Server = true;
                    //console.log("SUCCESSFULL SEND " + startNumber);
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
        RandomNum: bbtGetRandomInt(1,65535),
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
        console.log('KeepAlive OK BoxId: ' + boxId);
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
	    RandomNum: bbtGetRandomInt(1,65535),
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


function bbtGetRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }


# RaceMapVirtualTimes

reads the times over the racemap api and send it to time2win server. Each timekeeping point has its own box id and the first timekeeping point has the boxid defined in the config.json->boxId. All other timekeeping points will get an incremented box id.

All the data will be stored in a json-database file. This file can be viewed also via excel file data.xlsx (in data folder). You only have to adapt the filepath, that the right json file will be loaded.

## Getting started

- change raceMapEventId in config.js
- change boxId in config.js (if needed, standard starts @ 300)
- start script: 
  - npm start
  - node index.js
    


## How to setup server on AWS

- setup MEAN instance
- clone repo: git clone https://gitlab.com/t21000/racemap/racemapvirtualtimes.git


```
cd existing_repo
git remote add origin https://gitlab.com/t21000/racemap/racemapvirtualtimes.git
git branch -M main
git push -uf origin main
```

### PM2 configuration

pm2 watch doesn't work because of database file. The files are changing every time and then it will do a restart.
Now linked with andi00085@gmail.com

```
sudo npm install pm2 -g
pm2 link 60iry6zdtx71fbd 304eo8q7z3pzyew
pm2 startup
sudo env PATH=$PATH:/opt/bitnami/node/bin /opt/bitnami/node/lib/node_modules/pm2/bin/pm2 startup systemd -u bitnami --hp /home/bitnami
pm2 start index.js --name racemapvirtualtimes 
pm2 save
```

#### PM2 commands

- show detailed information
```
pm2 monit
```

- show listed information
```
pm2 list
```

- delete application
```
pm2 delete racemapvirtualtimes
```


## Racemap test event

- "raceMapEventId": "60a3b443f096f800018add7c",



***


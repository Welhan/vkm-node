// async function sheetGame(sheetData, insertId, bracketUrl, FileID) {
//   console.log("Mulai Game");
//   let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
//   let startDate = (await helpers.doQuery(db, queryStartDate)).results;
//   let start = "02";
//   if (startDate.length > 0) {
//     start = startDate[0].Value;
//   }
//   const today = new Date();
//   const day = today.getDate();
//   let end = String(parseInt(start) - 1).padStart(2, "0");
//   let dateCondition = "";
//   if (day <= parseInt(start) - 1) {
//     dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;
//   } else {
//     dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
//   }
//   return await new Promise(async (resolve) => {
//     parentPort.postMessage({
//       message: `Processing Game started`,
//     });
//     for (let [index, el] of sheetData.entries()) {
//       if (!el.Player) {
//         parentPort.postMessage({
//           row: index + 2,
//           message: "Terdapat Kolom Player yang Kosong",
//         });
//       } else {
//         await new Promise(async (rslv, reject) => {
//           let dateNow = helpers.formatDate(new Date());
//           let token = `W${process.env.websiteID}|${el.Player}||${dateNow}`;
//           token = Buffer.from(token).toString("base64");
//           await axios
//             .post(
//               bracketUrl + "player-api",
//               {},
//               {
//                 headers: {
//                   Authorization: `Bearer ${token}`,
//                   "Content-Type": "application/json",
//                 },
//               }
//             )
//             .then(async (response) => {
//               if (
//                 response.data.player == true &&
//                 response.data.status == true
//               ) {
//                 // cek db top_gamer dlu
//                 await new Promise(async (rs, rj) => {
//                   console.log(`Mulai looping ${parseInt(index) + 1}`);
//                   games.map(async (game) => {
//                     cekGame = `SELECT * FROM top_gamer WHERE Username = ? AND ${dateCondition} AND Game_Category = ?`;
//                     let resultGame = (
//                       await helpers.doQuery(db, cekGame, [el.Player, game])
//                     ).results;
//                     to = 0;
//                     if (game == "Slot") {
//                       to = el.Slot > 0 ? el.Slot : 0;
//                     } else if (game == "Casino") {
//                       to = el.Casino > 0 ? el.Casino : 0;
//                     }
//                     if (resultGame.length > 0) {
//                       db.query("START TRANSACTION", function (err) {
//                         if (err) {
//                           console.log(err);
//                           db.query(`ROLLBACK`, function (error) {
//                             if (error) {
//                               console.log(error);
//                             }
//                           });
//                         }
//                         db.query(
//                           `UPDATE top_gamer SET FileID = ?, Turnover = ? WHERE Username = ? AND ${dateCondition} AND Game_Category = ?`,
//                           [insertId, to, el.Player.toString(), game],
//                           function (err) {
//                             if (err) {
//                               helpers.log_update(
//                                 "error",
//                                 `Player ${el.Player} not updated in top_game`
//                               );
//                               console.error(err);
//                               rj(err);
//                             }
//                             db.query(`COMMIT`, function (err) {
//                               if (err) {
//                                 console.log(err);
//                               }
//                               rs();
//                             });
//                           }
//                         );
//                       });
//                     } else {
//                       db.query("START TRANSACTION", function (err) {
//                         if (err) {
//                           console.log(err);
//                           db.query(`ROLLBACK`, function (error) {
//                             if (error) {
//                               console.log(error);
//                             }
//                           });
//                         }
//                         db.query(
//                           `INSERT INTO top_gamer (FileID, Date, WebsiteID, Game_Category, Username, FakeAcc, Turnover, CDate) VALUE (?,NOW(),?,?,?,?,?,NOW())`,
//                           [
//                             insertId,
//                             process.env.websiteID,
//                             game,
//                             el.Player,
//                             el["Fake Account"].toLowerCase() == "n" ? 0 : 1,
//                             to,
//                           ],
//                           function (err) {
//                             if (err) {
//                               console.error(err);
//                               helpers.log_update(
//                                 "error",
//                                 `Player ${el.Player} not updated in top_game`
//                               );
//                               rj(err);
//                             }
//                             db.query(`COMMIT`, function (err) {
//                               if (err) {
//                                 console.log(err);
//                               }
//                               rs();
//                             });
//                           }
//                         );
//                       });
//                     }
//                   });
//                 });
//               } else {
//                 let TotalNotFound = 0;
//                 let getTotalNotFound = (
//                   await helpers.doQuery(
//                     db,
//                     `SELECT TotalNotFound FROM files WHERE ID = ${FileID}`
//                   )
//                 ).results;
//                 if (getTotalNotFound.length == 0) {
//                   TotalNotFound = 2;
//                 } else {
//                   TotalNotFound = getTotalNotFound[0].TotalNotFound + 2;
//                 }
//                 db.query(
//                   `UPDATE files SET TotalNotFound = ${TotalNotFound} WHERE ID = ${FileID}`,
//                   function (err) {
//                     if (err) {
//                       console.log(err);
//                     }
//                     helpers.log_update(
//                       "error",
//                       `Player ${el.Player} not found in top_gamer`
//                     );
//                     parentPort.postMessage({
//                       row: index + 2,
//                       player: el.Player,
//                       message: `Top Game, Baris ${
//                         index + 2
//                       } Player not found in the system`,
//                     });
//                     rslv();
//                   }
//                 );
//               }
//             })
//             .catch((err) => {
//               console.log(err);
//               reject(err);
//             });
//           rslv();
//         });
//       }
//     }
//     parentPort.postMessage({ message: `Processing Top Game completed` });
//     resolve();
//   });
// }

// async function sheetTop50(sheetData, insertId, bracketUrl, FileID) {
//   console.log("Mulai Top 50");
//   let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
//   let startDate = (await helpers.doQuery(db, queryStartDate)).results;
//   let start = "02";
//   if (startDate.length > 0) {
//     start = startDate[0].Value;
//   }
//   start = String(start).padStart(2, "0");
//   const today = new Date();
//   const day = today.getDate();
//   let end = String(parseInt(start) - 1).padStart(2, "0");
//   let dateCondition = "";
//   if (day <= parseInt(start) - 1) {
//     dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;
//   } else {
//     dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
//   }
//   return await new Promise(async (resolve) => {
//     parentPort.postMessage({
//       message: `Processing Top 50 started`,
//     });
//     for (let [index, el] of sheetData.entries()) {
//       console.log("Mulai looping " + index + 1);
//       if (!el.Player) {
//         parentPort.postMessage({
//           row: index + 2,
//           message: "Terdapat Kolom Player yang Kosong",
//         });
//       } else {
//         await new Promise(async (rslv, reject) => {
//           let dateNow = helpers.formatDate(new Date());
//           let token = `W${process.env.websiteID}|${el.Player}|${el.Loyalty}|${dateNow}`;
//           token = Buffer.from(token).toString("base64");
//           await axios
//             .post(
//               bracketUrl + "player-api",
//               {},
//               {
//                 headers: {
//                   Authorization: `Bearer ${token}`,
//                   "Content-Type": "application/json",
//                 },
//               }
//             )
//             .then(async (response) => {
//               if (
//                 response.data.player == true &&
//                 response.data.status == true
//               ) {
//                 // cek level up
//                 if (el["Fake Account"].toLowerCase() == "n") {
//                   const loyaltyLowerCase = loyalty.map((level) =>
//                     level.toLowerCase()
//                   );
//                   let sqlLevelUp = `SELECT * FROM user WHERE Username = ?`;
//                   let checkLevel = (
//                     await helpers.doQuery(db, sqlLevelUp, [el.Player])
//                   ).results;
//                   if (checkLevel.length > 0) {
//                     if (
//                       checkLevel[0].Loyalty !== "" &&
//                       checkLevel[0].Loyalty !== null &&
//                       checkLevel[0].Loyalty !== undefined
//                     ) {
//                       let curIndex = loyaltyLowerCase.indexOf(
//                         checkLevel[0].Loyalty.toLowerCase()
//                       );
//                       let levelIndex = loyaltyLowerCase.indexOf(
//                         el.Loyalty.toLowerCase()
//                       );
//                       bonus = 0;

//                       if (levelIndex > curIndex) {
//                         let indexHadiah = curIndex + 1;
//                         let selisih = levelIndex - curIndex;
//                         for (let i = 0; i < selisih; i++) {
//                           let prizeSql = `SELECT Bonus FROM loyalty_bonus WHERE Tier = ?`;
//                           let prize = (
//                             await helpers.doQuery(db, prizeSql, [
//                               loyalty[indexHadiah],
//                             ])
//                           ).results;
//                           if (prize[0]) {
//                             bonus += prize[0]["Bonus"];
//                           }
//                           indexHadiah++;
//                         }
//                         // insert db levelUp history
//                         db.query(`START TRANSACTION`, async function (err) {
//                           if (err) {
//                             console.log(err);
//                             db.query(`ROLLBACK`, function (err) {
//                               if (err) {
//                                 console.log(err);
//                               }
//                             });
//                           }
//                           let query = `INSERT INTO levelup_history (WebsiteID, Username, CurrentLevel, LevelUpTo, Prize, CDate) VALUES (?,?,?,?,?, NOW())`;
//                           let values = [
//                             process.env.websiteID,
//                             el.Player,
//                             loyalty[curIndex],
//                             loyalty[levelIndex],
//                             bonus,
//                           ];
//                           db.query(query, values, function (err) {
//                             if (err) {
//                               console.error(err);
//                             }
//                             // update user loyalty
//                             db.query(
//                               `UPDATE user SET Loyalty = ?, LevelUpDate = NOW() WHERE Username = ?`,
//                               [loyalty[levelIndex], el.Player.toString()],
//                               function (err) {
//                                 if (err) {
//                                   console.error(err);
//                                 }
//                                 db.query(`COMMIT`, function (err) {
//                                   if (err) {
//                                     console.log(err);
//                                   }
//                                 });
//                               }
//                             );
//                           });
//                         });
//                       }
//                     } else {
//                       db.query(`START TRANSACTION`, async function (err) {
//                         if (err) {
//                           console.log(err);
//                           db.query(`ROLLBACK`, function (err) {
//                             if (err) {
//                               console.log(err);
//                             }
//                           });
//                         }
//                         db.query(
//                           `UPDATE user SET Loyalty = ?, LevelUpDate = NOW() WHERE Username = ?`,
//                           [el.Loyalty, el.Player.toString()],
//                           function (err) {
//                             if (err) {
//                               console.error(err);
//                             }
//                             db.query(`COMMIT`, function (err) {
//                               if (err) {
//                                 console.log(err);
//                               }
//                             });
//                           }
//                         );
//                       });
//                     }
//                   }
//                 }

//                 // cek player di top_league, ada update, ga ada insert
//                 cekLeague = `SELECT * FROM top_league WHERE Username = ? AND ${dateCondition};`;
//                 let resultLeague = (
//                   await helpers.doQuery(db, cekLeague, [el.Player])
//                 ).results;
//                 // cek league
//                 const today = new Date();
//                 let curLeague = el.Loyalty;
//                 let lastLeague = "";
//                 if (resultLeague.length > 0) {
//                   lastLeague = resultLeague[0].Loyalty;
//                 }
//                 if (today.getDate() !== parseInt(start)) {
//                   if (resultLeague.length > 0) {
//                     curLeague = resultLeague[0].Loyalty;
//                   }
//                 }
//                 if (resultLeague.length > 0) {
//                   db.query(`START TRANSACTION`, async function (err) {
//                     if (err) {
//                       console.log(err);
//                       db.query(`ROLLBACK`, function (err) {
//                         if (err) {
//                           console.log(err);
//                         }
//                       });
//                     }
//                     let query = `UPDATE top_league set FileID = ?, Loyalty = ?, League = ?, Last_league = ?, Turnover = ?, Last_Date = NOW() WHERE ID = ?`;
//                     let values = [
//                       insertId,
//                       el.Loyalty,
//                       curLeague,
//                       lastLeague,
//                       el.Turnover,
//                       resultLeague[0].ID,
//                     ];
//                     db.query(query, values, function (err, result) {
//                       if (err) {
//                         console.log(err);
//                         helpers.log_update(
//                           "error",
//                           `Player ${el.Player} not updated in top_league`
//                         );
//                         reject(err);
//                       } else {
//                         helpers.log_update(
//                           "success",
//                           `Player ${el.Player} updated in top_league`
//                         );
//                         db.query(`COMMIT`, function (err) {
//                           if (err) {
//                             console.log(err);
//                           }
//                           rslv(result);
//                         });
//                       }
//                     });
//                   });
//                 } else {
//                   db.query(`START TRANSACTION`, async function (err) {
//                     if (err) {
//                       console.log(err);
//                       db.query(`ROLLBACK`, function (err) {
//                         if (err) {
//                           console.log(err);
//                         }
//                       });
//                     }
//                     let query = `INSERT INTO top_league (FileID, Date, WebsiteID, Loyalty, League, Last_League, Username, FakeAcc, Turnover,CDate) VALUE (?,NOW(),?,?,?,'',?,?,?, NOW())`;
//                     let values = [
//                       insertId,
//                       process.env.websiteID,
//                       el.Loyalty,
//                       el.Loyalty,
//                       el.Player,
//                       el["Fake Account"].toLowerCase() == "n" ? 0 : 1,
//                       el.Turnover,
//                     ];
//                     db.query(query, values, function (err, result) {
//                       if (err) {
//                         console.log(err);
//                         helpers.log_update(
//                           "error",
//                           `Player ${el.Player} not updated in top_league`
//                         );
//                         reject(err);
//                       } else {
//                         db.query(`COMMIT`, function (err) {
//                           if (err) {
//                             console.log(err);
//                           }
//                           rslv(result);
//                         });
//                       }
//                     });
//                   });
//                 }
//               } else {
//                 db.query(
//                   `SELECT TotalNotFound FROM files WHERE ID = ${FileID}`,
//                   function (err, resultQuery) {
//                     if (err) {
//                       console.log(err);
//                     }
//                     let TotalNotFound =
//                       resultQuery[0].TotalNotFound != 0
//                         ? resultQuery[0].TotalNotFound
//                         : 0;
//                     TotalNotFound = TotalNotFound + 1;
//                     db.query(
//                       `UPDATE files SET TotalNotFound = ${TotalNotFound} WHERE ID = ${FileID}`,
//                       function (err) {
//                         if (err) {
//                           console.log(err);
//                         }
//                         helpers.log_update(
//                           "error",
//                           `Player ${el.Player} not found in top_league di row ${
//                             index + 2
//                           }`
//                         );
//                         parentPort.postMessage({
//                           row: index + 2,
//                           player: el.Player,
//                           message: `Top 50, Baris ${
//                             index + 2
//                           } Player not found in the system`,
//                         });
//                         rslv();
//                       }
//                     );
//                   }
//                 );
//               }
//             })
//             .catch((err) => {
//               console.log(`error : ${err}`);
//               reject(err);
//             });
//         });
//       }
//       if (index == sheetData.length - 1) {
//         db.query(`COMMIT`, function (err) {
//           if (err) {
//             console.log(err);
//           }
//           parentPort.postMessage({ message: `Processing Top 50 completed` });
//           resolve();
//         });
//       }
//     }
//   });
// }

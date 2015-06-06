var crypto = require('crypto')
	, path = require('path')
	, validator = require('validator')
	, _ = require('lodash')
	, Promise = require('bluebird')
	, fs = require('fs')
	, formidable = require('formidable')
	, gm = require('gm')
	, usersDir
	, recipesDir
	, knex
	, handlers;

var util = require('util').inspect;
var isp = function(x) {
	console.log(util(x));
}
var log = console.log;

Promise.promisifyAll(fs);

exports.init = function(app) {
	usersDir = app.get('usersDir');
	recipesDir = app.get('recipesDir');
	knex = app.get('knex');

	/* API */
	app.post('/users', handlers.createUser);
	app.post('/tokens', handlers.createToken);
	app.post('/users/:user_id', handlers.getUser);
	app.get('/users/count', handlers.getUsersCount);
	app.post('/users/:user_id/delete', handlers.deleteUser);
	app.post('/users/:user_id/update', handlers.updateUser);
	app.post('/users/followers', handlers.getFollowerUsers);
	app.post('/users/followings', handlers.getFollowingUsers);
	app.post('/recipes', handlers.createRecipe);
	app.get('/recipes/list', handlers.getRecipeList); // 레시피 목록, 어쩌면 조회하는 유저 id도 param에 넣어야 할지도.
	app.get('/recipes/:recipe_id/user/:user_id', handlers.getRecipe); // 레시피 상세보기
	app.post('/recipes/delete', handlers.deleteRecipe);
	app.post('/recipes/update', handlers.updateRecipe);
	app.post('/recipes/like', handlers.likeRecipe);
	app.post('/recipes/unlike', handlers.unlikeRecipe);
	app.post('/recipes/comment', handlers.writeComment);
	app.post('/recipes/comment/delete', handlers.deleteComment);
	app.post('/recipes/question', handlers.writeQuestion);
	app.post('/recipes/question/delete', handlers.deleteQuestion);
	app.post('/recipes/question/reply', handlers.writeReply);
	app.post('/recipes/question/reply/delete', handlers.deleteReply);
	app.get('/recipes/:recipe_id/images/:image_name', handlers.recipeImageDownload); //테스트하려고 임시로 image_num->image_name으로 변경
	app.get('/users/profile/:user_id', handlers.userImageDownload);
};

function sendError(res, errMsg) {
	res.status(200).send({
		result: 0,
		msg: errMsg
	});
};

function getLogFormat(req) {
	return req.ip + ' - - "' + req.method + ' ' + req.path + '" ';
};

function encryptPassword(password) {
	return crypto.createHmac('sha1', 'cymk').update(password).digest('hex');
}

exports.handlers = handlers = {
	createUser: function(req, res) {
		var email = req.body.email || 'mail' + Math.floor((Math.random() * 100000) + 1) + '@test.com'
			, userName = req.body.username || '애플한입베어물고'
			, password = req.body.password || 'password'
			, phone = req.body.phone || '01012341234'
			, profile_text = req.body.profile_text
			, profileImagePath;

		if (!validator.isEmail(email) || validator.isNull(userName) || validator.isNull(password)) {
			console.log(getLogFormat(req) + '잘못된 요청 / email: ' + email);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		knex('users').count('* as count').where('email', email).first().then(function(user) {
			if (user.count) {
				console.log(getLogFormat(req) + '유저 생성 실패 / email: ' + email);
				sendError(res, '이메일이 존재합니다. 해당 이메일로 로그인하시거나 다른 이메일로 가입 해주세요');
				return;
			}

			var token = crypto
			.createHash('md5')
			.update(email + (new Date()).getTime() + 'cymk')
			.digest('hex');

			var userData = {
				email: email,
				name: userName,
				password: encryptPassword(password),
				token: token,
				phone: phone,
				profile_text: profile_text
			};

			knex('users').insert(userData).then(function(result) {
				// 프로필 이미지를 저장합니다
				var form = formidable.IncomingForm();
				form.uploadDir = usersDir;
				form.parse(req, function(error, fields, files) {
					if (error) {
						console.log(error);
						return;
					}

					var file = files.profile;
					profileImagePath = path.join(usersDir, result[0].toString());
					fs.renameAsync(file.path, profileImagePath).then(function() {
						gm(profileImagePath).resize(120, 120).noProfile().write(profileImagePath, function(err) { if (err) throw err; });
						log('프로필 파일 저장 완료: ' + profileImagePath);
					}).catch(function(err) {
						if (err) throw err;
					});
				});

				res.status(200).send({
					result: 1, 
					user_id: result
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '유저 생성 실패 Knex 오류 / email: ' + email);
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 Knex 오류 / email: ' + email);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	createToken: function(req, res) {
		var email = req.body.email,
			password = req.body.password;

		if (!validator.isEmail(email) || validator.isNull(password)) {
			console.log(getLogFormat(req) + '잘못된 요청 / email : ' + email);
			sendError(res, '잘못된 요청입니다.');
			return;
		}

		knex('users').select('id', 'password', 'token').where('email', email).first().then(function(user) {
			if (user) {
				if (encryptPassword(password) === user.password) {
					res.status(200).send({
						result: 1,
						user_id: user.id,
						token: user.token
					});
				} else {
					console.log(getLogFormat(req) + '패스워드 불일치 / user_id: ' + user.id);
					sendError(res, '패스워드가 일치하지 않습니다. 다시 확인해 주세요');
				}
			} else {
				console.log(getLogFormat(req) + '유저 정보 없음 / email: ' + email);
				sendError(res, '정보가 존재하지 않습니다. 회원가입 후 로그인 해주세요');
			}
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / email: ' + email);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getUser: function(req, res) {
		var userId = req.params.user_id;

		if (!validator.isNumeric(userId)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user-id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		var columns = ['id', 'email', 'name', 'phone', 'profile_text', 'point', 'level', 'recipe_count', 'following_count', 'follower_count'];
		knex('users').select(columns).where('id', userId).first().then(function(user) {
			if (!user) {
				console.log(getLogFormat(req) + '유저 정보 없음 / user_id: ' + userId);
				sendError(res, '유저 정보가 없습니다');
			}
			//logger.info(getLogFormat(req) + '유저 조회 성공 / user_id: ' + userId);
			res.status(200).send({
				result: 1,
				user: {
					user_id: user.id,
					email: user.email,
					username: user.name,
					phone: user.phone,
					profile_text: user.profile_text,
					point: user.point,
					level: user.level,
					recipe_count: user.recipe_count,
					following_count: user.following_count,
					follower_count: user.follower_count
				}
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getUsersCount: function(req, res) {
		console.log(knex('users').count('* as count').first().toString());
		knex('users').count('* as count').then(function(result) {
			res.status(200).send({
				result: 1,
				count: result[0].count
			});
		});
	},

	deleteUser: function(req, res) {

	},

	updateUser: function(req, res) {},

	getFollowerUsers: function(req, res) {},

	getFollowingUsers: function(req, res) {},

	createRecipebak: function(req, res) {//{{{
		var userId = req.body.user_id || _.sample(_.range(316, 355)),
			token = req.body.token || '81a5f198c40efe2ccb82f53942c84a38',
			title = req.body.title || '사과식빵피자',
			inst = req.body.instruction || '맛있겠다!||만들어보자||재료를 준비한다||만든다||빠밤||먹는다+_+',
			mainImageIndex = parseInt(req.body.mainimage) || 1,
			cooking_time = parseInt(req.body.cooking_time) || 10,
			theme = req.body.theme,
			ingredient = req.body.ingredient,
			source = req.body.source,

			imageLength = null,
			recipeId = null,
			images = {},
			orgImgs = {}, // 편집 안된 원본 이미지도 함께 저장합니다
			errMsg = [];

		log("title : " + req.body.title);
		log("inst : " + req.body.instruction);
		log("mainImage : " + req.body.mainImage);
		log("cooking time : " + req.body.cooking_time);
		log("theme : " + theme);
		log("ingredient : " + ingredient);
		log("source : " + source);

		if (!validator.isNumeric(userId) || validator.isNull(title)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			//sendError(res, '잘못된 요청입니다');
			//return;
		}

		knex('users').select('token').where('id', userId).first().then(function(user) {
			if (token != user.token) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				//sendError(res, '권한이 없습니다.');
				//return;
			}

			// 이미지를 임시폴더에 업로드하고 갯수를 가져옵니다.
			var form = formidable.IncomingForm();
			form.uploadDir = recipesDir;
			//form.keepExtensions = false; // default: false
			form.parse(req, function(error, fields, files) {

				_.forEach(files, function(file, index) {
					// index 앞에 o가 붙어있으면 original -> 원본 이미지. 따로 orgImgs에 모아두었다가 기본사이즈로 저장한다.
					//if (index.search("original") != -1) {
					//	orgImgs[index] = file.path;
					//} else {
					//	images[index] = file.path;
					//	imageLength++;
					//}
					if (index.search("original") == -1) imageLength++;
					images[index] = file.path;
				});

				log("imageLength : " + imageLength);

				if (imageLength == 0) return;

				if (error) {
					if (error.toString().indexOf('aborted')) return;
					console.log('파일 저장 실패 formidable 오류');
					//console.log('formidable error > ' + error);
					errMsg.push('이미지 저장에 실패하였습니다. 수정을 통해 다시 등록해주세요');
					return;
				}

				if (mainImageIndex >= imageLength || mainImageIndex == null) {
					mainImageIndex = imageLength - 1;
					log('메인이미지 지정에 오류가 있습니다');
					errMsg.push('메인이미지 지정에 오류가 있습니다. 마지막 이미지를 메인이미지로 지정합니다.');
				}



				var data = {
					user_id: userId,
					title: title,
					instruction: inst,
					text_length: textLength,
					image_length: imageLength,
					main_image_index: mainImageIndex,
					cooking_time: cooking_time,
					theme: theme,
					ingredient: ingredient,
					source: source
				};

				knex('recipes').insert(data).then(function(result) {
					var recipeId = result[0];
					var recipeDir = path.join(recipesDir, recipeId.toString());
					fs.mkdirAsync(recipeDir) .then(function() {
						// 이미지를 제자리에 옮깁니다.
						// [TODO] 예외처리 필요
						var imageDir = path.join(recipeDir, 'images');
						return fs.mkdirAsync(imageDir).then(function() {
							_.forEach(images, function(file, index) {
								/*
								   var fileExtension = file.split('.').pop();
								   var filePath = path.join(recipeDir, index + '.' + fileExtension);
								   */
								var filePath = path.join(imageDir, index);
								fs.renameAsync(file, filePath).catch(function(err) {
									log("레시피 " + recipeId + " - " + index + " : " + file);
									isp(err);
									throw err;
								});
							});
						})
					})
					.then(function() {
						res.status(200).send({
							result: 1,
							recipe_id: result[0],
							error_msg: errMsg || null
						});
					}).catch(function(err) {
						if (err) {
							console.log(getLogFormat(req) + '폴더 생성 실패');
							console.log(err);
							sendError(res, '서버 오류로 인해 레시피를 생성하지 못했습니다. 다시 시도해주세요');
						}
					});
				}).catch(function(err) {
					console.log(getLogFormat(req) + '레시피 생성 실패 knex 오류 / user_id: ' + userId);
					console.log(err);
					_.forEach(images, function(file) { // 보통 function(file, index) 인데 file 하나만 해도 되는건가? 아님 그게 아니어서 자꾸 삭제가 안된거였나?
						fs.unlinkAsync(file).catch(function(err) { console.log(err) });
					});
					sendError(res, '서버 오류로 인해 레시피를 생성하지 못했습니다. 다시 시도해주세요');
				});
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},//}}}

	createRecipe: function(req, res) {
		var form = formidable.IncomingForm();
		form.uploadDir = recipesDir;
		//form.keepExtensions = false; // default: false
		form.parse(req, function(error, fields, files) {
			var userId = fields.user_id || req.body.user_id,
				token = fields.token || req.body.token,
				title = fields.title || req.body.title,
				inst = fields.instruction || req.body.instruction,
				mainImageIndex = parseInt(fields.main_image_index || req.body.main_image_index),
				cooking_time = parseInt(fields.cooking_time || req.body.cooking_time),
				theme = fields.theme || req.body.theme,
				ingredient = fields.ingredient || req.body.ingredient,
				source = fields.source || req.body.source,

				imageLength = 0,
				recipeId = null,
				images = {},
				orgImgs = {}, // 편집 안된 원본 이미지도 함께 저장합니다
				errMsg = [];

			if (files.size == 0) {
				console.log(getLogFormat(req) + '이미지가 없습니다 / user_id: ' + userId);
				sendError(res, '이미지가 없습니다.');
				return;
			}

			if (!validator.isNumeric(userId) || validator.isNull(title)) {
				console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
				//sendError(res, '잘못된 요청입니다');
				//return;
			}

			knex('users').select('token').where('id', userId).first().then(function(user) {
				if (token != user.token) {
					console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
					//sendError(res, '권한이 없습니다.');
					//return;
				}

				// 이미지를 임시폴더에 업로드하고 갯수를 가져옵니다.
				_.forEach(files, function(file, index) {
					if (index.search("original") == -1) imageLength++;
					images[index] = file.path;
				});

				// 여기있으면 안좋을텐데 어디다가 놓을지..
				if (error) {
					if (error.toString().indexOf('aborted')) return; // 이러면 계속 응답 대기상태가 되지 않나..? 아 사용자가 취소한거니 괜찮은가보다
					console.log('파일 저장 실패 formidable 오류');
					console.log('formidable error > ' + error);
					errMsg.push('이미지 저장에 실패하였습니다. 수정을 통해 다시 등록해주세요');
					return;
				}

				if (mainImageIndex >= imageLength || mainImageIndex == null) {
					mainImageIndex = imageLength - 1;
					log('메인이미지 지정에 오류가 있습니다');
					errMsg.push('메인이미지 지정에 오류가 있습니다. 마지막 이미지를 메인이미지로 지정합니다.');
				}

				var data = {
					user_id: userId,
					title: title,
					instruction: inst,
					image_length: parseInt(req.body.cooking_time),
					main_image_index: mainImageIndex,
					cooking_time: cooking_time,
					theme: theme,
					ingredient: ingredient,
					source: source
				};

				knex('recipes').insert(data).then(function(result) {
					var recipeId = result[0];
					var recipeDir = path.join(recipesDir, recipeId.toString());
					fs.mkdirAsync(recipeDir) .then(function() {
						// 이미지를 제자리에 옮깁니다.
						// [TODO] 예외처리 필요
						var imageDir = path.join(recipeDir, 'images');
						return fs.mkdirAsync(imageDir).then(function() {
							_.forEach(images, function(file, index) {
								var filePath = path.join(imageDir, index);
								fs.renameAsync(file, filePath).catch(function(err) {
									log("레시피 " + recipeId + " - " + index + " : " + file);
									isp(err);
									throw err;
								});
							});
						})
					})
					.then(function() {
						res.status(200).send({
							result: 1,
							recipe_id: result[0],
							error_msg: errMsg || null
						});
					}).catch(function(err) {
						if (err) {
							console.log(getLogFormat(req) + '폴더 생성 실패');
							console.log(err);
							sendError(res, '서버 오류로 인해 레시피를 생성하지 못했습니다. 다시 시도해주세요');
						}
					});
				}).catch(function(err) {
					console.log(getLogFormat(req) + '레시피 생성 실패 knex 오류 / user_id: ' + userId);
					console.log(err);
					_.forEach(images, function(file) {
						log('파일을 삭제합니다 - ' + file);
						fs.unlinkAsync(file).catch(function(err) { console.log(err) });
					});
					sendError(res, '서버 오류로 인해 레시피를 생성하지 못했습니다. 다시 시도해주세요');
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		})
	},

	getRecipeList: function(req, res) {
		// Execute stored procedure (require execute privilege)
		knex.raw('call getRecipeList').then(function(results) {
			results = results[0][0];
			results = _.pluck(results, 'id');

			knex('recipes').select('id', 'title', 'main_image_index').whereIn('id', results).then(function(recipes) {
				res.status(200).send({
					result: 1,
					recipes: recipes
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '레시피 조회 실패 knex 오류');
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '레시피 목록 조회 실패 knex 오류 / mysql procedure');
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getRecipe: function(req, res) {
		var recipeId = req.params.recipe_id;
		var userId = req.params.user_id;

		var columns = ['users.id as user_id', 'users.name as username', 'instruction', 'cooking_time', 'theme', 'ingredient', 'source', 'like_count', 'scrap_count', 'text_length'];
		knex('recipes').join('users', 'users.id', '=', 'recipes.user_id').select(columns).where('recipes.id', recipeId).first().then(function(recipe) {
			if (userId == recipe.user_id) {
				recipe.type = 'MY';
			}
			//logger.info(getLogFormat(req) + '레시피 조회 성공');
			res.status(200).send({
				result: 1,
				recipe: recipe
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '레시피 조회 실패 knex 오류 / recipe_id: ' + recipeId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	deleteRecipe: function(req, res) {},
	updateRecipe: function(req, res) {},

	likeRecipe: function(req, res) {
		var userId = req.body.user_id,
			recipeId = req.body.recipe_id;

		var data = {user_id: userId, recipe_id: recipeId};

		knex('likes').insert(data).then(function(result) {
			res.status(200).send({
				result: 1
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + 'like 생성 실패 knex 오류');
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	unlikeRecipe: function(req, res) {
		var userId = req.body.user_id,
			recipeId = req.body.recipe_id;

		var data = {user_id: useId, recipe_id: recipeId};

		knex('likes').delete(data).then(function(result) {
			res.status(200).send({
				result: 1
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + 'like 생성 실패 knex 오류');
			console.log(err);
			sendError(res, '서버 오류');
		});
	},
	writeComment: function(req, res) {
		var userId = req.body.user_id,
			recipeId = req.body.recipe_id,
			comment = req.body.comment;

		if (!validator.isNumeric(userId)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		knex('users').select('token').where('id', userId).first().then(function(user) {
			if (token != user.token) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				sendError(res, '권한이 없습니다');
				return;
			}

			var data = {user_id: userId, recipe_id: recipeId, comment: comment};
			knex('comments').insert(data).then(function(result) {
				res.status(200).send({
					result: 1
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + 'comment 생성 실패 knex 오류 / recipe_id: ' + recipeId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	deleteComment: function(req, res) {
		var userId = req.body.user_id,
			token = req.body.token,
			recipeId = req.body.recipe_id;

		if (!validator.isNumeric(userId)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		knex('users').select('token').where('id', userId).first().then(function(user) {
			if (user.token != token) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				sendError(res, '권한이 없습니다');
				return;
			}

			var data = {user_id: userId, recipe_id: recipeId};
			knex('comments').delete(data).then(function(result) {
				res.status(200).send({
					result: 1
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + 'comment 삭제 실패 knex 오류 / recipe_id: ' + recipeId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	writeQuestion: function(req, res) {},
	deleteQuestion: function(req, res) {},
	writeReply: function(req, res) {},
	deleteReply: function(req, res) {},
	recipeImageDownload: function(req, res) {
		var recipeId = req.params.recipe_id;
		//var imageNum = req.params.image_num;
		var imageNum = req.params.image_name.split('.')[0];

		var imagePath = path.join(recipesDir, recipeId, 'images', imageNum);
		res.sendFile(imagePath);
	},
	userImageDownload: function(req, res) {
		var userId = req.params.user_id;
		var imagePath = path.join(usersDir, userId);
		res.sendFile(imagePath);
	}
}

var Sequelize = require('sequelize')
	, sequelize
	, db

exports.init = function(app) {
	db = app.get('config').db;
	sequelize = new Sequelize(db.database, db.username, db.password, db.options);
	app.set('sequelize', sequelize);
	app.set('db', this.registerAndGetModels(sequelize));
	sequelize.sync().success(function() {
	}).error(function(err) {
		console.log(err);
	});
};

exports.registerAndGetModels = function(sequelize) {
	var User = sequelize.import(__dirname + '/users');
	var Recipe = sequelize.import(__dirname + '/recipes');
	var Comment = sequelize.import(__dirname + '/comments');
	var Question = sequelize.import(__dirname + '/questions');
	var Reply = sequelize.import(__dirname + '/replies');
	var Like = sequelize.import(__dirname + '/likes');
	var Fork = sequelize.import(__dirname + '/forks');

	Recipe.belongsTo(User, {foreignKey: 'user_id'});
	Comment.belongsTo(User, {foreignKey: 'user_id'});
	Comment.belongsTo(Recipe, {foreignKey: 'recipe_id'});
	Question.belongsTo(User, {foreignKey: 'user_id'});
	Question.belongsTo(Recipe, {foreignKey: 'recipe_id'});
	Reply.belongsTo(User, {foreignKey: 'user_id'});
	Reply.belongsTo(Question, {foreignKey: 'question_id'});
	Fork.belongsTo(User, {foreignKey: 'user_id'});
	Fork.belongsTo(Recipe, {foreignKey: 'recipe_id'});

	// following_id : 팔로우 당하는 사람 / follower_id: 팔로우 하는 사람
	User.belongsToMany(User, {foreignKey: 'following_id', as: 'follower', through: 'follows'});

	return {
		User: User,
		Comment: Comment,
		Question: Question,
		Reply: Reply,
		Fork: Fork
	};
};

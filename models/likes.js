module.exports = function(sequelize, DataTypes) {
	return sequelize.define('likes', {
		user_id: {
			type: DataTypes.INTEGER,
			unique: 'like'
		},
		recipe_id: {
			type: DataTypes.INTEGER,
			unique: 'like'
		}
	}, {
		freezeTableName: true,
		tableName: 'likes'
	});
}

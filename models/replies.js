module.exports = function(sequelize, DataTypes) {
	return sequelize.define('replies', {
		user_id: {
			type: DataTypes.INTEGER,
			unique: 'reply'
		},
		question_id: {
			type: DataTypes.INTEGER,
			unique: 'reply'
		}
	}, {
		freezeTableName: true,
		tableName: 'replies'
	});
}

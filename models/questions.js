module.exports = function(sequelize, dataTypes) {
	return sequelize.define('comments', {
		id {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			autoIncerment: true
		}
	}, {
		freezeTableName: true,
		tableName: 'comments'
	});
}

package db

import (
	"errors"
	"strings"

	"gorm.io/gorm"
)

// IsDuplicateError 判断错误是否为数据库 UNIQUE 约束冲突(SQLite/MySQL/PostgreSQL)
func IsDuplicateError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := strings.ToLower(err.Error())
	// SQLite: UNIQUE constraint failed; MySQL: Duplicate entry; PostgreSQL: duplicate key value
	return strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "duplicate entry") ||
		strings.Contains(msg, "duplicate key")
}

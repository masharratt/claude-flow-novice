### Flask Development Patterns

**Framework Configuration:**
- Use Flask with Blueprints for modular architecture
- Implement Flask-SQLAlchemy for ORM
- Use Flask-JWT-Extended for authentication
- Configure environment-based settings
- Implement comprehensive error handling

**Concurrent Agent Execution:**
```python
# ✅ CORRECT: Flask development with specialized agents
[Single Message]:
  Task("Flask Developer", "Build blueprints and views with SQLAlchemy models", "backend-dev")
  Task("Database Designer", "Design SQLAlchemy models with relationships", "code-analyzer")
  Task("Auth Engineer", "Implement JWT authentication and role-based access", "system-architect")
  Task("API Designer", "Create Flask-RESTX API with Swagger documentation", "researcher")
  Task("Test Engineer", "Write pytest tests with Flask test client", "tester")

  # Batch Flask file operations
  Write("app/__init__.py")
  Write("app/models/user.py")
  Write("app/api/users.py")
  Write("app/auth/views.py")
  Write("tests/test_api.py")

  # Flask-specific todos
  TodoWrite({ todos: [
    {content: "Setup Flask application factory with blueprints", status: "in_progress", activeForm: "Setting up Flask application factory with blueprints"},
    {content: "Create SQLAlchemy models with migrations", status: "pending", activeForm: "Creating SQLAlchemy models with migrations"},
    {content: "Implement JWT authentication with decorators", status: "pending", activeForm: "Implementing JWT authentication with decorators"},
    {content: "Build RESTful API endpoints with validation", status: "pending", activeForm: "Building RESTful API endpoints with validation"},
    {content: "Write comprehensive tests with fixtures", status: "pending", activeForm: "Writing comprehensive tests with fixtures"}
  ]})
```

**Project Structure:**
```
app/
  __init__.py          # Application factory
  config.py            # Configuration classes
  models/
    __init__.py
    user.py
    base.py
  api/                 # API blueprints
    __init__.py
    users.py
    auth.py
  auth/                # Authentication blueprint
    __init__.py
    views.py
    decorators.py
  utils/               # Utility functions
    __init__.py
    validators.py
    helpers.py
  extensions.py        # Extensions initialization
migrations/            # Database migrations
tests/
  conftest.py
  test_models.py
  test_api.py
  fixtures/
requirements.txt
```

**Application Factory:**
```python
# app/__init__.py
from flask import Flask
from app.extensions import db, jwt, migrate, cors, ma
from app.config import config

def create_app(config_name='development'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app)
    ma.init_app(app)

    # Register blueprints
    from app.api import bp as api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    from app.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    # Error handlers
    register_error_handlers(app)

    return app

def register_error_handlers(app):
    @app.errorhandler(400)
    def bad_request(error):
        return {
            'error': 'Bad Request',
            'message': 'The request could not be understood or was missing required parameters.',
            'status_code': 400
        }, 400

    @app.errorhandler(401)
    def unauthorized(error):
        return {
            'error': 'Unauthorized',
            'message': 'Authentication is required and has failed or has not been provided.',
            'status_code': 401
        }, 401

    @app.errorhandler(403)
    def forbidden(error):
        return {
            'error': 'Forbidden',
            'message': 'You do not have permission to access this resource.',
            'status_code': 403
        }, 403

    @app.errorhandler(404)
    def not_found(error):
        return {
            'error': 'Not Found',
            'message': 'The requested resource could not be found.',
            'status_code': 404
        }, 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return {
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred.',
            'status_code': 500
        }, 500

# app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_cors import CORS
from flask_marshmallow import Marshmallow

db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate()
cors = CORS()
ma = Marshmallow()
```

**Configuration:**
```python
# app/config.py
import os
from datetime import timedelta

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT Configuration
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_BLACKLIST_ENABLED = True
    JWT_BLACKLIST_TOKEN_CHECKS = ['access', 'refresh']

    # CORS Configuration
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')

    # Pagination
    USERS_PER_PAGE = 20

    # Email Configuration
    MAIL_SERVER = os.environ.get('MAIL_SERVER')
    MAIL_PORT = int(os.environ.get('MAIL_PORT') or 587)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() in ['true', 'on', '1']
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DEV_DATABASE_URL') or \
        'sqlite:///' + os.path.join(os.path.dirname(__file__), 'app-dev.db')

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(seconds=1)

class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(os.path.dirname(__file__), 'app.db')

config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
```

**Models:**
```python
# app/models/base.py
from app.extensions import db
from datetime import datetime

class BaseModel(db.Model):
    __abstract__ = True

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def save(self):
        """Save instance to database"""
        db.session.add(self)
        db.session.commit()
        return self

    def delete(self):
        """Delete instance from database"""
        db.session.delete(self)
        db.session.commit()

    def to_dict(self):
        """Convert instance to dictionary"""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

# app/models/user.py
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, create_refresh_token
from app.extensions import db
from app.models.base import BaseModel

class User(BaseModel):
    __tablename__ = 'users'

    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)

    def __repr__(self):
        return f'<User {self.email}>'

    @property
    def password(self):
        raise AttributeError('Password is not readable')

    @password.setter
    def password(self, password):
        self.password_hash = generate_password_hash(password)

    def verify_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    def generate_tokens(self):
        """Generate access and refresh tokens"""
        return {
            'access_token': create_access_token(identity=self.id),
            'refresh_token': create_refresh_token(identity=self.id)
        }

    @classmethod
    def find_by_email(cls, email):
        return cls.query.filter_by(email=email).first()

    @classmethod
    def find_by_id(cls, user_id):
        return cls.query.filter_by(id=user_id).first()

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'full_name': self.full_name,
            'is_active': self.is_active,
            'is_admin': self.is_admin,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
```

**Serialization with Marshmallow:**
```python
# app/schemas/user.py
from marshmallow import Schema, fields, validate, validates_schema, ValidationError
from app.models.user import User

class UserRegistrationSchema(Schema):
    email = fields.Email(required=True, validate=validate.Length(max=120))
    first_name = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    last_name = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    password = fields.Str(required=True, validate=validate.Length(min=8))
    password_confirm = fields.Str(required=True)

    @validates_schema
    def validate_passwords(self, data, **kwargs):
        if data['password'] != data['password_confirm']:
            raise ValidationError('Passwords do not match', 'password_confirm')

    @validates_schema
    def validate_email_unique(self, data, **kwargs):
        if User.find_by_email(data['email']):
            raise ValidationError('Email already registered', 'email')

class UserSchema(Schema):
    id = fields.Int(dump_only=True)
    email = fields.Email(dump_only=True)
    first_name = fields.Str()
    last_name = fields.Str()
    full_name = fields.Str(dump_only=True)
    is_active = fields.Bool(dump_only=True)
    is_admin = fields.Bool(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)

class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True)

class UserUpdateSchema(Schema):
    first_name = fields.Str(validate=validate.Length(min=1, max=50))
    last_name = fields.Str(validate=validate.Length(min=1, max=50))
```

**API Views:**
```python
# app/api/users.py
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from marshmallow import ValidationError
from app.models.user import User
from app.schemas.user import UserSchema, UserRegistrationSchema, UserUpdateSchema
from app.auth.decorators import admin_required
from app.extensions import db

bp = Blueprint('users', __name__)

@bp.route('/users', methods=['POST'])
def register():
    """Register a new user"""
    try:
        schema = UserRegistrationSchema()
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400

    # Create new user
    user = User(
        email=data['email'],
        first_name=data['first_name'],
        last_name=data['last_name']
    )
    user.password = data['password']
    user.save()

    # Return user data with tokens
    tokens = user.generate_tokens()
    user_schema = UserSchema()

    return jsonify({
        'message': 'User registered successfully',
        'user': user_schema.dump(user),
        'tokens': tokens
    }), 201

@bp.route('/users', methods=['GET'])
@jwt_required()
@admin_required
def get_users():
    """Get all users (Admin only)"""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    search = request.args.get('search', '')

    query = User.query
    if search:
        query = query.filter(
            User.email.contains(search) |
            User.first_name.contains(search) |
            User.last_name.contains(search)
        )

    pagination = query.paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )

    users = pagination.items
    user_schema = UserSchema(many=True)

    return jsonify({
        'users': user_schema.dump(users),
        'pagination': {
            'page': page,
            'pages': pagination.pages,
            'per_page': per_page,
            'total': pagination.total,
            'has_next': pagination.has_next,
            'has_prev': pagination.has_prev
        }
    })

@bp.route('/users/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    """Get user by ID"""
    current_user_id = get_jwt_identity()
    current_user = User.find_by_id(current_user_id)

    # Users can only view their own profile unless they're admin
    if not current_user.is_admin and current_user_id != user_id:
        return jsonify({'message': 'Access denied'}), 403

    user = User.find_by_id(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    user_schema = UserSchema()
    return jsonify({'user': user_schema.dump(user)})

@bp.route('/users/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user's profile"""
    current_user_id = get_jwt_identity()
    user = User.find_by_id(current_user_id)

    if not user:
        return jsonify({'message': 'User not found'}), 404

    user_schema = UserSchema()
    return jsonify({'user': user_schema.dump(user)})

@bp.route('/users/me', methods=['PUT'])
@jwt_required()
def update_current_user():
    """Update current user's profile"""
    current_user_id = get_jwt_identity()
    user = User.find_by_id(current_user_id)

    if not user:
        return jsonify({'message': 'User not found'}), 404

    try:
        schema = UserUpdateSchema()
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400

    # Update user data
    for field, value in data.items():
        setattr(user, field, value)

    user.save()

    user_schema = UserSchema()
    return jsonify({
        'message': 'Profile updated successfully',
        'user': user_schema.dump(user)
    })

@bp.route('/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_user(user_id):
    """Delete user (Admin only)"""
    user = User.find_by_id(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    user.delete()
    return jsonify({'message': 'User deleted successfully'}), 204
```

**Authentication:**
```python
# app/auth/views.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from marshmallow import ValidationError
from app.models.user import User
from app.schemas.user import LoginSchema

bp = Blueprint('auth', __name__)

# Store blacklisted tokens (in production, use Redis)
blacklisted_tokens = set()

@bp.route('/login', methods=['POST'])
def login():
    """User login"""
    try:
        schema = LoginSchema()
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400

    user = User.find_by_email(data['email'])

    if not user or not user.verify_password(data['password']):
        return jsonify({'message': 'Invalid email or password'}), 401

    if not user.is_active:
        return jsonify({'message': 'Account is disabled'}), 401

    tokens = user.generate_tokens()

    return jsonify({
        'message': 'Login successful',
        'tokens': tokens,
        'user': user.to_dict()
    })

@bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """User logout"""
    jti = get_jwt()['jti']
    blacklisted_tokens.add(jti)

    return jsonify({'message': 'Successfully logged out'})

@bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token"""
    current_user_id = get_jwt_identity()
    user = User.find_by_id(current_user_id)

    if not user or not user.is_active:
        return jsonify({'message': 'User not found or inactive'}), 404

    new_tokens = user.generate_tokens()

    return jsonify({
        'tokens': new_tokens
    })

# JWT token blacklist checker
@bp.before_app_request
def check_if_token_revoked():
    pass

# app/auth/decorators.py
from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt_identity
from app.models.user import User

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user_id = get_jwt_identity()
        user = User.find_by_id(current_user_id)

        if not user or not user.is_admin:
            return jsonify({'message': 'Admin access required'}), 403

        return f(*args, **kwargs)
    return decorated
```

**Testing:**
```python
# tests/conftest.py
import pytest
import tempfile
import os
from app import create_app
from app.extensions import db
from app.models.user import User

@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app('testing')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'

    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

    os.close(db_fd)
    os.unlink(db_path)

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def runner(app):
    return app.test_cli_runner()

@pytest.fixture
def auth_headers(client):
    # Create test user
    user = User(
        email='test@example.com',
        first_name='Test',
        last_name='User'
    )
    user.password = 'TestPassword123!'
    user.save()

    # Login and get token
    response = client.post('/auth/login', json={
        'email': 'test@example.com',
        'password': 'TestPassword123!'
    })

    token = response.json['tokens']['access_token']
    return {'Authorization': f'Bearer {token}'}

# tests/test_api.py
def test_user_registration(client):
    """Test user registration"""
    response = client.post('/api/users', json={
        'email': 'newuser@example.com',
        'first_name': 'New',
        'last_name': 'User',
        'password': 'Password123!',
        'password_confirm': 'Password123!'
    })

    assert response.status_code == 201
    data = response.json
    assert data['message'] == 'User registered successfully'
    assert data['user']['email'] == 'newuser@example.com'
    assert 'tokens' in data

def test_user_login(client):
    """Test user login"""
    # Create user first
    user = User(
        email='login@example.com',
        first_name='Login',
        last_name='User'
    )
    user.password = 'Password123!'
    user.save()

    response = client.post('/auth/login', json={
        'email': 'login@example.com',
        'password': 'Password123!'
    })

    assert response.status_code == 200
    data = response.json
    assert data['message'] == 'Login successful'
    assert 'tokens' in data
    assert data['user']['email'] == 'login@example.com'

def test_get_current_user(client, auth_headers):
    """Test getting current user profile"""
    response = client.get('/api/users/me', headers=auth_headers)

    assert response.status_code == 200
    data = response.json
    assert data['user']['email'] == 'test@example.com'

def test_update_current_user(client, auth_headers):
    """Test updating current user profile"""
    response = client.put('/api/users/me',
                         headers=auth_headers,
                         json={
                             'first_name': 'Updated',
                             'last_name': 'Name'
                         })

    assert response.status_code == 200
    data = response.json
    assert data['message'] == 'Profile updated successfully'
    assert data['user']['first_name'] == 'Updated'
    assert data['user']['last_name'] == 'Name'

def test_invalid_login(client):
    """Test login with invalid credentials"""
    response = client.post('/auth/login', json={
        'email': 'nonexistent@example.com',
        'password': 'WrongPassword'
    })

    assert response.status_code == 401
    data = response.json
    assert data['message'] == 'Invalid email or password'

def test_access_without_token(client):
    """Test accessing protected endpoint without token"""
    response = client.get('/api/users/me')

    assert response.status_code == 401
```
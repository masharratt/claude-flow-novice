### Django Development Patterns

**Framework Configuration:**
- Use Django REST Framework for API development
- Implement custom user models and authentication
- Use Django's built-in ORM with migrations
- Configure proper settings for different environments
- Implement comprehensive testing with fixtures

**Concurrent Agent Execution:**
```python
# ✅ CORRECT: Django development with specialized agents
[Single Message]:
  Task("Django Developer", "Build models, views, and serializers with DRF", "backend-dev")
  Task("Database Architect", "Design PostgreSQL schema with Django migrations", "code-analyzer")
  Task("Auth Engineer", "Implement JWT/Token authentication with permissions", "system-architect")
  Task("Test Engineer", "Write Django TestCase and pytest tests", "tester")
  Task("API Designer", "Create OpenAPI documentation and validation", "researcher")

  # Batch Django file operations
  Write("myproject/settings.py")
  Write("apps/users/models.py")
  Write("apps/users/serializers.py")
  Write("apps/users/views.py")
  Write("tests/test_users.py")

  # Django-specific todos
  TodoWrite({ todos: [
    {content: "Setup Django project with apps structure", status: "in_progress", activeForm: "Setting up Django project with apps structure"},
    {content: "Create custom user model and authentication", status: "pending", activeForm: "Creating custom user model and authentication"},
    {content: "Implement DRF serializers and viewsets", status: "pending", activeForm: "Implementing DRF serializers and viewsets"},
    {content: "Configure database and run migrations", status: "pending", activeForm: "Configuring database and running migrations"},
    {content: "Write comprehensive API tests with fixtures", status: "pending", activeForm: "Writing comprehensive API tests with fixtures"}
  ]})
```

**Project Structure:**
```
myproject/
  myproject/
    __init__.py
    settings/
      __init__.py
      base.py
      development.py
      production.py
      test.py
    urls.py
    wsgi.py
    asgi.py
  apps/
    users/
      __init__.py
      models.py
      serializers.py
      views.py
      urls.py
      admin.py
      tests.py
      migrations/
    core/
      __init__.py
      permissions.py
      pagination.py
      mixins.py
  tests/
    fixtures/
    unit/
    integration/
  requirements/
    base.txt
    development.txt
    production.txt
```

**Settings Configuration:**
```python
# myproject/settings/base.py
import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here')

# Application definition
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
]

LOCAL_APPS = [
    'apps.users',
    'apps.core',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'myproject.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'myproject'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# Custom User Model
AUTH_USER_MODEL = 'users.User'

# REST Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# JWT Configuration
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
}

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
}
```

**Custom User Model:**
```python
# apps/users/models.py
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone
from .managers import UserManager

class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=30)
    last_name = models.CharField(max_length=30)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    def get_short_name(self):
        return self.first_name

# apps/users/managers.py
from django.contrib.auth.models import BaseUserManager
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Users must have an email address')

        try:
            validate_email(email)
        except ValidationError:
            raise ValueError('Invalid email address')

        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)
```

**Serializers:**
```python
# apps/users/serializers.py
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth import authenticate
from .models import User

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password]
    )
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name', 'password', 'password_confirm')

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Password fields didn't match.")
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(**validated_data)
        return user

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'full_name',
                 'is_active', 'date_joined', 'updated_at')
        read_only_fields = ('id', 'date_joined', 'updated_at')

class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('first_name', 'last_name')

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(style={'input_type': 'password'})

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')

        if email and password:
            user = authenticate(
                request=self.context.get('request'),
                username=email,
                password=password
            )

            if not user:
                raise serializers.ValidationError(
                    'Unable to log in with provided credentials.'
                )

            if not user.is_active:
                raise serializers.ValidationError(
                    'User account is disabled.'
                )

            attrs['user'] = user
            return attrs
        else:
            raise serializers.ValidationError(
                'Must include email and password.'
            )
```

**ViewSets and API Views:**
```python
# apps/users/views.py
from rest_framework import status, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from .serializers import (
    UserSerializer,
    UserRegistrationSerializer,
    UserUpdateSerializer,
    LoginSerializer
)

User = get_user_model()

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['is_active', 'is_staff']
    search_fields = ['email', 'first_name', 'last_name']
    ordering_fields = ['date_joined', 'email']
    ordering = ['-date_joined']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserRegistrationSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == 'create':
            permission_classes = [permissions.AllowAny]
        elif self.action in ['update', 'partial_update', 'destroy']:
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAdminUser]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """Get current user's profile"""
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['put', 'patch'], permission_classes=[permissions.IsAuthenticated])
    def update_profile(self, request):
        """Update current user's profile"""
        serializer = UserUpdateSerializer(
            request.user,
            data=request.data,
            partial=request.method == 'PATCH'
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        refresh = RefreshToken.for_user(user)

        return Response({
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_200_OK)

class LogoutAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': 'Successfully logged out'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': 'Invalid token'},
                status=status.HTTP_400_BAD_REQUEST
            )
```

**Testing:**
```python
# tests/test_users.py
import pytest
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user_data():
    return {
        'email': 'test@example.com',
        'first_name': 'Test',
        'last_name': 'User',
        'password': 'TestPassword123!',
        'password_confirm': 'TestPassword123!'
    }

@pytest.fixture
def create_user():
    def make_user(**kwargs):
        return User.objects.create_user(
            email=kwargs.get('email', 'test@example.com'),
            first_name=kwargs.get('first_name', 'Test'),
            last_name=kwargs.get('last_name', 'User'),
            password=kwargs.get('password', 'TestPassword123!')
        )
    return make_user

@pytest.fixture
def authenticated_client(api_client, create_user):
    user = create_user()
    refresh = RefreshToken.for_user(user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client, user

@pytest.mark.django_db
class TestUserRegistration:
    def test_register_user_success(self, api_client, user_data):
        url = reverse('user-list')
        response = api_client.post(url, user_data)

        assert response.status_code == status.HTTP_201_CREATED
        assert User.objects.filter(email=user_data['email']).exists()
        assert 'password' not in response.data

    def test_register_user_invalid_email(self, api_client, user_data):
        user_data['email'] = 'invalid-email'
        url = reverse('user-list')
        response = api_client.post(url, user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data

    def test_register_user_password_mismatch(self, api_client, user_data):
        user_data['password_confirm'] = 'DifferentPassword123!'
        url = reverse('user-list')
        response = api_client.post(url, user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'non_field_errors' in response.data

@pytest.mark.django_db
class TestUserAuthentication:
    def test_login_success(self, api_client, create_user):
        user = create_user()
        url = reverse('login')
        response = api_client.post(url, {
            'email': user.email,
            'password': 'TestPassword123!'
        })

        assert response.status_code == status.HTTP_200_OK
        assert 'tokens' in response.data
        assert 'access' in response.data['tokens']
        assert 'refresh' in response.data['tokens']
        assert response.data['user']['email'] == user.email

    def test_login_invalid_credentials(self, api_client, create_user):
        user = create_user()
        url = reverse('login')
        response = api_client.post(url, {
            'email': user.email,
            'password': 'WrongPassword'
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_user_profile(self, authenticated_client):
        client, user = authenticated_client
        url = reverse('user-me')
        response = client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == user.email
        assert response.data['full_name'] == user.full_name

    def test_update_user_profile(self, authenticated_client):
        client, user = authenticated_client
        url = reverse('user-update-profile')
        response = client.put(url, {
            'first_name': 'Updated',
            'last_name': 'Name'
        })

        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.first_name == 'Updated'
        assert user.last_name == 'Name'

@pytest.mark.django_db
class TestUserPermissions:
    def test_unauthenticated_access_denied(self, api_client):
        url = reverse('user-me')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_admin_can_list_users(self, api_client, create_user):
        admin_user = create_user(is_staff=True, is_superuser=True)
        refresh = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        url = reverse('user-list')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data

    def test_regular_user_cannot_list_users(self, authenticated_client):
        client, user = authenticated_client
        url = reverse('user-list')
        response = client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN
```

**URL Configuration:**
```python
# apps/users/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, LoginAPIView, LogoutAPIView

router = DefaultRouter()
router.register(r'users', UserViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', LoginAPIView.as_view(), name='login'),
    path('auth/logout/', LogoutAPIView.as_view(), name='logout'),
]

# myproject/urls.py
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('apps.users.urls')),

    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
```